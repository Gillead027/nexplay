import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { collectAdminOverview, isInstanceAdmin, type LiveVoiceStats } from './adminStats.js';
import { db } from './db.js';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { AccessToken, RoomServiceClient, TrackSource, WebhookReceiver } from 'livekit-server-sdk';
import multer, { MulterError } from 'multer';
import { z } from 'zod';
import {
  ACCENT_COLORS,
  MUSIC_BOT_IDENTITY,
  ATTACHMENT_INLINE_IMAGE_TYPES,
  ATTACHMENT_MAX_PER_MESSAGE,
  ATTACHMENT_MAX_SIZE_BYTES,
  AVATAR_DATA_URL_MAX_LENGTH,
  BAN_REASON_MAX_LENGTH,
  BANNER_DATA_URL_MAX_LENGTH,
  BIO_MAX_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
  CHANNEL_TOPIC_MAX_LENGTH,
  CHAT_MESSAGE_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  hasPermission,
  isStaffTier,
  MESSAGE_SEARCH_QUERY_MAX_LENGTH,
  MESSAGE_SEARCH_QUERY_MIN_LENGTH,
  MESSAGE_SEARCH_RESULTS_LIMIT,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  Permission,
  PRONOUNS_MAX_LENGTH,
  ROLE_NAME_MAX_LENGTH,
  SERVER_DESCRIPTION_MAX_LENGTH,
  SERVER_NAME_MAX_LENGTH,
  SOUNDBOARD_AUDIO_DATA_URL_MAX_LENGTH,
  SOUNDBOARD_MAX_DURATION_MS,
  SOUNDBOARD_NAME_MAX_LENGTH,
  STATUS_TEXT_MAX_LENGTH,
  TEXT_CHANNEL_DESCRIPTION_MAX_LENGTH,
  TEXT_CHANNEL_NAME_MAX_LENGTH,
  TIMEOUT_MAX_MINUTES,
  VOICE_BITRATE_MAX_KBPS,
  VOICE_BITRATE_MIN_KBPS,
  VOICE_USER_LIMIT_MAX,
  type Channel,
  type ForwardedFromMeta,
  type LiveKitTokenResponse,
  parseParticipantMetadata,
  readSelfMuted,
  type HumanParticipantMetadata,
  type MusicCommandResponse,
  type MusicNowPlayingCard,
  type PublicConfig,
  type RoomSummary,
  type UserSession,
  type VoiceChannel,
} from '@nexplay/shared';
import { config } from './config.js';
import {
  clearSessionCookie,
  createSession,
  getSession,
  inviteMatches,
  setSessionCookie,
} from './session.js';
import {
  createUser,
  getUserById,
  getUserByUsername,
  updateUserPassword,
  updateUserProfile,
  verifyPassword,
  type UserRecord,
} from './users.js';
import {
  createForwardedTextMessage,
  deleteMusicBotTextMessage,
  deleteMusicBotTextMessagesForVoiceChannel,
  deleteTextMessage,
  editTextMessage,
  getTextMessageById,
  upsertMusicBotTextMessage,
  createTextChannel,
  deleteTextChannel,
  renameTextChannel,
  createTextMessage,
  getMusicBotTextMessage,
  getTextChannelById,
  getTextChannelByName,
  listActiveMusicBotChannelIds,
  listPinnedMessages,
  listTextChannels,
  listTextMessages,
  pinTextMessage,
  searchTextMessages,
  slowModeRemainingSeconds,
  unpinTextMessage,
  updateTextChannelSettings,
} from './textChannels.js';
import {
  createCategory,
  deleteCategory,
  getCategoryById,
  getCategoryPrefs,
  listCategories,
  listCategoryPrefsForUser,
  setCategoryPrefs,
  updateCategory,
} from './categories.js';
import { resolveForwardDestination } from './forwardDestination.js';
import { addReaction, isValidReactionEmoji, removeReaction } from './reactions.js';
import { authorizeMusicCommand } from './musicCommands.js';
import { fetchMusicThumbnail } from './musicThumbnails.js';
import { authorizeVoiceDisconnect } from './voiceModeration.js';
import { attachRealtime, broadcast, disconnectUser, presence, sendToServerMembers, sendToUser, sendToUsers } from './realtime.js';
import {
  createVoiceChannel,
  renameVoiceChannel,
  deleteVoiceChannel,
  getVoiceChannelById,
  getVoiceChannelByName,
  listAllVoiceChannels,
  listVoiceChannels,
  updateVoiceChannelSettings,
} from './voiceChannels.js';
import { createSoundboardSound, deleteSoundboardSound, getSoundboardSoundById, listSoundboardSounds } from './soundboard.js';
import {
  createPendingAttachment,
  deleteAttachmentRecord,
  getAttachmentRecordById,
  getAttachmentRecordsForMessage,
  listOrphanedAttachments,
  sanitizeFilename,
} from './attachments.js';
import { deleteAttachmentObject, ensureAttachmentsBucket, getAttachmentObjectStream, uploadAttachmentObject } from './storage.js';
import {
  assignRole,
  createRole,
  deleteRole,
  getRoleById,
  getRoleByName,
  getUserHighestPosition,
  getUserPermissionBitfield,
  getUserRoleIds,
  listRoles,
  unassignRole,
  updateRole,
} from './roles.js';
import { authorizeModerationAction, banUser, isBanned, listBans, unbanUser } from './moderation.js';
import { createServer, deleteServer, getServerById, listServersForUser, updateServer } from './servers.js';
import {
  getServerMember,
  isServerMember,
  listMemberUserIdsForServer,
  listServerMembers,
  removeServerMember,
  setServerMemberTimeout,
} from './serverMembers.js';
import { getInviteByCode, getOrCreateServerInvite, regenerateServerInvite, redeemInvite } from './invites.js';
import {
  getFriendshipBetween,
  listFriends,
  listIncomingRequests,
  listOutgoingRequests,
  removeFriendship,
  sendOrAcceptFriendRequest,
} from './friendships.js';
import { blockUser, isBlocked, listBlockedUsers, unblockUser } from './blocks.js';
import {
  createDmMessage,
  createForwardedDmMessage,
  deleteDmMessage,
  editDmMessage,
  getDmChannelForParticipant,
  getDmMessageById,
  listDmChannelsForUser,
  listDmMessages,
  openDmChannel,
} from './dmChannels.js';

const app = express();
const roomService = new RoomServiceClient(
  config.LIVEKIT_INTERNAL_URL,
  config.LIVEKIT_API_KEY,
  config.LIVEKIT_API_SECRET,
);

if (config.isProduction) app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: config.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  }),
);
app.use(express.json({ limit: '2mb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos.' },
});

const textMessageLimiter = rateLimit({
  windowMs: 10 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Você está enviando mensagens rápido demais.' },
});

const reactionLimiter = rateLimit({
  windowMs: 10 * 1000,
  limit: 40,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas reações em pouco tempo.' },
});

const channelCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Limite de criação de canais atingido. Tente novamente mais tarde.' },
});

const roleLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Limite de alterações de cargo atingido. Tente novamente mais tarde.' },
});

const moderationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas ações de moderação em pouco tempo.' },
});

const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitos envios de arquivo em pouco tempo.' },
});

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ATTACHMENT_MAX_SIZE_BYTES, files: 1 },
});

const friendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas ações de amizade em pouco tempo.' },
});

const dmChannelLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Limite de novas conversas atingido. Tente novamente mais tarde.' },
});

const dmMessageLimiter = rateLimit({
  windowMs: 10 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Você está enviando mensagens rápido demais.' },
});

// Envolve o middleware do multer manualmente pra devolver um erro amigável
// (413 com o teto real) em vez de cair no handler de erro genérico do fim
// do arquivo — multer chama next(error) em vez de lançar, e um MulterError
// por tamanho de arquivo merece uma resposta diferente de um 500 qualquer.
function handleAttachmentUpload(request: Request, response: Response, next: NextFunction): void {
  attachmentUpload.single('file')(request, response, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
      response.status(413).json({ error: `Arquivo muito grande — máximo de ${Math.floor(ATTACHMENT_MAX_SIZE_BYTES / 1024 / 1024)}MB.` });
      return;
    }
    response.status(400).json({ error: 'Não foi possível processar o arquivo enviado.' });
  });
}

const usernameSchema = z
  .string()
  .trim()
  .min(DISPLAY_NAME_MIN_LENGTH)
  .max(DISPLAY_NAME_MAX_LENGTH)
  .regex(/^[\p{L}\p{N} _.-]+$/u, 'O nome contém caracteres não permitidos.');

const registerSchema = z.object({
  username: usernameSchema,
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  // Só é exigido quando o cadastro não é aberto (OPEN_REGISTRATION).
  inviteToken: z.string().optional(),
  accentColor: z.enum(ACCENT_COLORS),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const dataUrlPattern = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;
const audioDataUrlPattern = /^data:audio\/(mpeg|ogg|wav|webm);base64,[A-Za-z0-9+/]+=*$/;

const soundboardSoundSchema = z.object({
  name: z.string().trim().min(1).max(SOUNDBOARD_NAME_MAX_LENGTH),
  emoji: z.string().trim().min(1).max(8),
  audioDataUrl: z.string().max(SOUNDBOARD_AUDIO_DATA_URL_MAX_LENGTH).refine((value) => audioDataUrlPattern.test(value), 'Áudio inválido.'),
  durationMs: z.number().int().positive().max(SOUNDBOARD_MAX_DURATION_MS),
});

const profileSchema = z.object({
  accentColor: z.enum(ACCENT_COLORS),
  statusText: z.string().trim().max(STATUS_TEXT_MAX_LENGTH).default(''),
  bio: z.string().trim().max(BIO_MAX_LENGTH).default(''),
  pronouns: z.string().trim().max(PRONOUNS_MAX_LENGTH).default(''),
  avatarUrl: z
    .string()
    .max(AVATAR_DATA_URL_MAX_LENGTH)
    .refine((value) => value === '' || dataUrlPattern.test(value), 'Avatar inválido.')
    .default(''),
  bannerUrl: z
    .string()
    .max(BANNER_DATA_URL_MAX_LENGTH)
    .refine((value) => value === '' || dataUrlPattern.test(value), 'Banner inválido.')
    .default(''),
});

const tokenSchema = z.object({ roomId: z.string().min(1).max(32) });
const disconnectParticipantSchema = z.object({
  roomId: z.string().min(1).max(32),
  identity: z.string().min(1).max(128),
});

const musicCommandSchema = z.object({
  roomId: z.string().min(1).max(32),
  text: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_LENGTH),
  textChannelId: z.string().min(1).max(32).optional(),
});

const serverCreateSchema = z.object({
  name: z.string().trim().min(1).max(SERVER_NAME_MAX_LENGTH),
  description: z.string().trim().max(SERVER_DESCRIPTION_MAX_LENGTH).default(''),
});

const serverUpdateSchema = z.object({
  name: z.string().trim().min(1).max(SERVER_NAME_MAX_LENGTH).optional(),
  description: z.string().trim().max(SERVER_DESCRIPTION_MAX_LENGTH).optional(),
  iconDataUrl: z
    .string()
    .max(AVATAR_DATA_URL_MAX_LENGTH)
    .refine((value) => value === '' || dataUrlPattern.test(value), 'Ícone inválido.')
    .optional(),
  accentColor: z.enum(ACCENT_COLORS).nullable().optional(),
});

const serverDeleteSchema = z.object({
  confirmName: z.string(),
});

const inviteCodeSchema = z.string().trim().min(1).max(32);

// \p{S} (Symbol) cobre emoji — canais/categorias podem levar um emoji no
// nome (ex.: "🏠 — regras"), igual Discord real. React escapa texto ao
// renderizar, então isto não é uma superfície de XSS: a lista só existia
// pra manter nomes "limpos" de caracteres de controle.
const CHANNEL_NAME_PATTERN = /^[\p{L}\p{N}\p{M}\p{Zs}\p{S}\p{P}]+$/u;

const channelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(TEXT_CHANNEL_NAME_MAX_LENGTH)
    .regex(CHANNEL_NAME_PATTERN),
  description: z.string().trim().max(TEXT_CHANNEL_DESCRIPTION_MAX_LENGTH).default(''),
});

const textMessageSchema = z.object({
  // Sem mínimo aqui de propósito: uma mensagem só de anexo (imagem sem
  // legenda, igual Discord real) é válida — a checagem "tem que ter texto OU
  // anexo" é feita na própria rota, depois de validar isto.
  text: z.string().trim().max(CHAT_MESSAGE_MAX_LENGTH),
  replyToMessageId: z.string().min(1).max(64).optional(),
  attachmentIds: z.array(z.string().min(1)).max(ATTACHMENT_MAX_PER_MESSAGE).optional(),
  // Exige MANAGE_MESSAGES na própria rota (não aqui, que só valida forma) —
  // publica com nome/ícone do servidor em vez do autor (ver toMessage,
  // textChannels.ts).
  postedAsSystem: z.boolean().optional(),
});

const reactionSchema = z.object({
  emoji: z.string().refine(isValidReactionEmoji, 'Emoji não suportado.'),
});

const dmMessageSchema = z.object({
  text: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_LENGTH),
});

const forwardDestinationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('channel'), serverId: z.string().min(1), channelId: z.string().min(1) }),
  z.object({ kind: z.literal('dm'), dmChannelId: z.string().min(1) }),
]);
const forwardMessageSchema = z.object({ destination: forwardDestinationSchema });

const ALL_PERMISSIONS_MASK = Object.values(Permission).reduce((mask, flag) => mask | flag, 0);
const permissionsBitfieldSchema = z.number().int().min(0).max(ALL_PERMISSIONS_MASK);
const roleColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida.');

const roleCreateSchema = z.object({
  name: z.string().trim().min(1).max(ROLE_NAME_MAX_LENGTH),
  color: roleColorSchema,
  permissions: permissionsBitfieldSchema,
  hoist: z.boolean().default(false),
});

const roleUpdateSchema = z.object({
  name: z.string().trim().min(1).max(ROLE_NAME_MAX_LENGTH).optional(),
  color: roleColorSchema.optional(),
  permissions: permissionsBitfieldSchema.optional(),
  hoist: z.boolean().optional(),
});

const timeoutSchema = z.object({
  userId: z.string().min(1),
  minutes: z.number().int().min(1).max(TIMEOUT_MAX_MINUTES),
});

const banSchema = z.object({
  userId: z.string().min(1),
  serverId: z.string().min(1),
  reason: z.string().trim().max(BAN_REASON_MAX_LENGTH).default(''),
});

const voiceKickSchema = z.object({ userId: z.string().min(1) });

const messageSearchQuerySchema = z.string().trim().min(MESSAGE_SEARCH_QUERY_MIN_LENGTH).max(MESSAGE_SEARCH_QUERY_MAX_LENGTH);

function requireSession(request: Request, response: Response, next: NextFunction): void {
  const identity = getSession(request);
  if (!identity) {
    response.status(401).json({ error: 'Sessão ausente ou expirada.' });
    return;
  }
  const user = getUserById(identity.id);
  if (!user) {
    response.status(401).json({ error: 'Sessão inválida.' });
    return;
  }
  // Checado a cada requisição (não só no login) porque a sessão é um cookie
  // stateless de até 12h — sem isso, um usuário banido continuaria com
  // acesso completo até o cookie expirar sozinho.
  if (isBanned(user.id)) {
    clearSessionCookie(response);
    response.status(403).json({ error: 'Sua conta foi banida deste servidor.' });
    return;
  }
  response.locals.user = user;
  next();
}

function currentUser(response: Response): UserRecord {
  return response.locals.user as UserRecord;
}

// Precisa rodar DEPOIS de requireSession e ANTES de qualquer rota/middleware
// que leia response.locals.serverId — resolve o :serverId da rota e garante
// que o usuário autenticado é membro dele. 404, nunca 403: não revela a
// existência de um servidor do qual a pessoa não faz parte.
function requireServerMembership(request: Request, response: Response, next: NextFunction): void {
  const serverId = request.params.serverId;
  const user = currentUser(response);
  if (typeof serverId !== 'string' || !isServerMember(serverId, user.id)) {
    response.status(404).json({ error: 'Servidor não encontrado.' });
    return;
  }
  response.locals.serverId = serverId;
  next();
}

function currentServerId(response: Response): string {
  return response.locals.serverId as string;
}

function requireServerPermission(flag: number) {
  return (_request: Request, response: Response, next: NextFunction): void => {
    const user = currentUser(response);
    if (!hasPermission(getUserPermissionBitfield(user.id, currentServerId(response)), flag)) {
      response.status(403).json({ error: 'Você não tem permissão para fazer isso.' });
      return;
    }
    next();
  };
}

// Esconde canais de uma categoria staffOnly de quem não é staff (ver
// isStaffTier em packages/shared) — a categoria em si nem aparece na lista
// de categorias pra esse usuário (ver rota GET categories).
function filterChannelsByCategoryAccess<T extends { categoryId: string | null }>(
  serverId: string,
  userId: string,
  channels: T[],
): T[] {
  const staffOnlyIds = new Set(listCategories(serverId).filter((category) => category.staffOnly).map((category) => category.id));
  if (staffOnlyIds.size === 0 || isStaffTier(getUserPermissionBitfield(userId, serverId))) return channels;
  return channels.filter((channel) => !channel.categoryId || !staffOnlyIds.has(channel.categoryId));
}

function visibleCategories(serverId: string, userId: string) {
  const categories = listCategories(serverId);
  if (isStaffTier(getUserPermissionBitfield(userId, serverId))) return categories;
  return categories.filter((category) => !category.staffOnly);
}

function activeTimeoutRemainingMs(timeoutUntil: number | null): number {
  return timeoutUntil && timeoutUntil > Date.now() ? timeoutUntil - Date.now() : 0;
}

// Timeout passou a ser por servidor (server_members.timeout_until, ver
// serverMembers.ts) em vez de instância inteira — um timeout no servidor A
// não impede mais mensagem/soundboard/voz no servidor B, nem DM (DM nunca
// chama esta função — ver decisão em DISCORD_PARITY_PLAN.md).
function rejectIfTimedOut(serverId: string, userId: string, response: Response): boolean {
  const member = getServerMember(serverId, userId);
  const remaining = activeTimeoutRemainingMs(member?.timeoutUntil ?? null);
  if (remaining <= 0) return false;
  const minutes = Math.ceil(remaining / 60_000);
  response.status(403).json({ error: `Você está em timeout por mais ${minutes} minuto(s).` });
  return true;
}

// Usado tanto pra "expulsar da voz" (KICK_MEMBERS) quanto pra forçar
// desconexão ao aplicar ban/timeout — procura em qual canal de voz (se
// algum) o usuário está agora, já que não guardamos esse estado localmente
// (a fonte da verdade é sempre o LiveKit). Ban é global (ver
// DISCORD_PARITY_PLAN.md), então a varredura precisa cobrir TODOS os
// servidores, não só um.
async function findActiveRoomIdForUser(userId: string): Promise<string | null> {
  for (const channel of listAllVoiceChannels()) {
    try {
      const participants = await roomService.listParticipants(channel.id);
      if (participants.some((participant) => participant.identity === userId)) return channel.id;
    } catch {
      // Sala sem participantes ainda não existe no LiveKit — não é erro.
    }
  }
  return null;
}

async function forceDisconnectFromVoice(userId: string): Promise<void> {
  const roomId = await findActiveRoomIdForUser(userId);
  if (!roomId) return;
  try {
    await roomService.removeParticipant(roomId, userId);
  } catch (error) {
    console.error(`Falha ao forçar desconexão de voz de ${userId}:`, error);
  }
}

// Chamada tanto na abertura de um canal (fetch inicial) quanto por um laço
// periódico server-side (ver setInterval mais abaixo) — nos dois casos,
// qualquer mudança real é empurrada via WebSocket, então o cliente nunca
// mais precisa pollar isso diretamente.
async function refreshMusicBotTextMessage(textChannelId: string): Promise<void> {
  const existing = getMusicBotTextMessage(textChannelId);
  const voiceChannelId = existing?.musicCard?.voiceChannelId;
  const textChannel = getTextChannelById(textChannelId);
  if (!existing || !voiceChannelId || !textChannel) return;
  const serverId = textChannel.serverId;
  try {
    const stateResponse = await fetch(
      `${config.MUSIC_BOT_INTERNAL_URL}/state?channelId=${encodeURIComponent(voiceChannelId)}`,
      { signal: AbortSignal.timeout(2_000) },
    );
    if (!stateResponse.ok) return;
    const state = (await stateResponse.json()) as { nowPlaying?: unknown };
    if (!state.nowPlaying || typeof state.nowPlaying !== 'object') {
      if (deleteMusicBotTextMessage(textChannelId)) {
        sendToServerMembers(serverId, { type: 'TEXT_MESSAGE_DELETE', serverId, channelId: textChannelId, messageId: existing.id });
      }
      return;
    }
    const nowPlaying: MusicNowPlayingCard = {
      ...(state.nowPlaying as MusicNowPlayingCard),
      voiceChannelId,
    };
    const { message } = upsertMusicBotTextMessage(textChannelId, existing.text, nowPlaying);
    sendToServerMembers(serverId, { type: 'TEXT_MESSAGE_UPSERT', serverId, channelId: textChannelId, message });
  } catch {
    // Worker reiniciando: preserva o último card e tenta de novo no próximo ciclo.
  }
}

function toUserSession(user: UserRecord): UserSession {
  return {
    id: user.id,
    displayName: user.username,
    accentColor: user.accentColor,
    statusText: user.statusText,
    bio: user.bio,
    pronouns: user.pronouns,
    avatarUrl: user.avatarDataUrl,
    bannerUrl: user.bannerDataUrl,
  };
}

// Monta o Channel[] unificado de um servidor a partir das duas tabelas
// físicas separadas (text_channels/voice_channels — ver DISCORD_PARITY_PLAN.md
// sobre o risco de colisão de id ao fundi-las de verdade).
function listChannelsForServer(serverId: string): Channel[] {
  return [
    ...listTextChannels(serverId).map((channel): Channel => ({ type: 'TEXT', ...channel })),
    ...listVoiceChannels(serverId).map((channel): Channel => ({ type: 'VOICE', ...channel })),
  ];
}

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

// Com o cadastro aberto qualquer pessoa pode criar conta, então o limite por endereço é mais
// apertado que o do login: 10 contas por hora.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas contas criadas por este endereço. Tente de novo mais tarde.' },
});

// A tela de entrada pergunta antes de cadastrar se precisa mostrar o campo do código de cadastro.
app.get('/api/auth/registration', (_request, response) => {
  response.json({ open: config.OPEN_REGISTRATION });
});

app.post('/api/auth/register', registerLimiter, authLimiter, (request, response) => {
  const body = registerSchema.safeParse(request.body);
  if (!body.success) {
    response.status(400).json({ error: 'Informe um nome de usuário e senha válidos.' });
    return;
  }

  if (!config.OPEN_REGISTRATION && !inviteMatches(body.data.inviteToken ?? '')) {
    response.status(401).json({ error: 'Código de cadastro inválido.' });
    return;
  }

  const username = body.data.username.replace(/\s+/g, ' ');
  if (getUserByUsername(username)) {
    response.status(409).json({ error: 'Esse nome de usuário já existe.' });
    return;
  }

  const user = createUser(username, body.data.password, body.data.accentColor);
  // Conta nova não entra em servidor nenhum sozinha: só vê os servidores em que
  // entrar por convite (POST /api/invites/:code/redeem) ou que ela mesma criar.
  // O código de cadastro só libera criar a conta.
  const session = createSession(user.id, user.username);
  setSessionCookie(response, session);
  response.status(201).json({ user: toUserSession(user) });
});

app.post('/api/auth/login', authLimiter, (request, response) => {
  const body = loginSchema.safeParse(request.body);
  if (!body.success) {
    response.status(400).json({ error: 'Informe usuário e senha.' });
    return;
  }

  const user = getUserByUsername(body.data.username);
  if (!user || !verifyPassword(user, body.data.password)) {
    response.status(401).json({ error: 'Usuário ou senha inválidos.' });
    return;
  }
  if (isBanned(user.id)) {
    response.status(403).json({ error: 'Sua conta foi banida deste servidor.' });
    return;
  }

  const session = createSession(user.id, user.username);
  setSessionCookie(response, session);
  response.status(200).json({ user: toUserSession(user) });
});

app.get('/api/session', requireSession, (_request, response) => {
  response.json({ user: toUserSession(currentUser(response)) });
});

app.delete('/api/session', (_request, response) => {
  clearSessionCookie(response);
  response.status(204).end();
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

app.patch('/api/auth/password', requireSession, authLimiter, (request, response) => {
  const body = changePasswordSchema.safeParse(request.body);
  if (!body.success) {
    response.status(400).json({ error: `A nova senha deve ter entre ${PASSWORD_MIN_LENGTH} e ${PASSWORD_MAX_LENGTH} caracteres.` });
    return;
  }
  const user = currentUser(response);
  if (!verifyPassword(user, body.data.currentPassword)) {
    response.status(401).json({ error: 'Senha atual incorreta.' });
    return;
  }
  updateUserPassword(user.id, body.data.newPassword);
  response.status(204).end();
});

app.get('/api/profile', requireSession, (_request, response) => {
  response.json({ user: toUserSession(currentUser(response)) });
});

app.patch('/api/profile', requireSession, (request, response) => {
  const body = profileSchema.safeParse(request.body);
  if (!body.success) {
    response.status(400).json({ error: 'Perfil inválido.' });
    return;
  }

  const user = currentUser(response);
  updateUserProfile(
    user.id,
    body.data.accentColor,
    body.data.statusText,
    body.data.bio,
    body.data.pronouns,
    body.data.avatarUrl,
    body.data.bannerUrl,
  );
  response.json({
    user: toUserSession({
      ...user,
      accentColor: body.data.accentColor,
      statusText: body.data.statusText,
      bio: body.data.bio,
      pronouns: body.data.pronouns,
      avatarDataUrl: body.data.avatarUrl,
      bannerDataUrl: body.data.bannerUrl,
    }),
  });
});

app.get('/api/users/:id/avatar', requireSession, (request, response) => {
  const id = request.params.id;
  const user = typeof id === 'string' ? getUserById(id) : undefined;
  if (!user?.avatarDataUrl) {
    response.status(404).json({ error: 'Sem avatar.' });
    return;
  }
  response.json({ avatarUrl: user.avatarDataUrl });
});

app.get('/api/users/:id/profile', requireSession, (request, response) => {
  const id = request.params.id;
  const user = typeof id === 'string' ? getUserById(id) : undefined;
  if (!user) {
    response.status(404).json({ error: 'Usuário não encontrado.' });
    return;
  }
  response.json({ user: toUserSession(user) });
});

// Painel de administração da instância: só os usuários de ADMIN_USERNAMES.
app.get('/api/admin/access', requireSession, (_request, response) => {
  response.json({ admin: isInstanceAdmin(currentUser(response).username, config.ADMIN_USERNAMES) });
});

app.get('/api/admin/overview', requireSession, async (_request, response) => {
  if (!isInstanceAdmin(currentUser(response).username, config.ADMIN_USERNAMES)) {
    response.status(403).json({ error: 'Você não tem permissão para fazer isso.' });
    return;
  }
  // Quem está em call agora, direto do LiveKit (o bot de música não conta como pessoa).
  let voice: LiveVoiceStats | null = null;
  try {
    let activeRooms = 0;
    let participants = 0;
    for (const room of await roomService.listRooms()) {
      const humans = (await roomService.listParticipants(room.name)).filter(
        (participant) => parseParticipantMetadata(participant.metadata)?.participantType !== 'BOT',
      ).length;
      if (humans > 0) activeRooms += 1;
      participants += humans;
    }
    voice = { activeRooms, participants };
  } catch (error) {
    console.error('Painel de administração: LiveKit não respondeu:', error);
  }
  response.json({
    overview: collectAdminOverview({
      db,
      dbPath: config.DB_PATH,
      dataDir: dirname(resolve(config.DB_PATH)),
      now: Date.now(),
      isOnline: (userId) => presence.isOnline(userId),
      voice,
    }),
  });
});

app.get('/api/config', requireSession, (_request, response) => {
  const payload: PublicConfig = {
    livekitUrl: config.LIVEKIT_PUBLIC_URL,
  };
  response.json(payload);
});

app.get('/api/servers', requireSession, (_request, response) => {
  response.json({ servers: listServersForUser(currentUser(response).id) });
});

// Qualquer usuário autenticado pode criar um servidor, sem permissão
// especial (igual Discord real) — quem cria vira dono e Administrador dele.
app.post('/api/servers', requireSession, channelCreateLimiter, (request, response) => {
  const body = serverCreateSchema.safeParse(request.body);
  if (!body.success) {
    response.status(400).json({ error: 'Informe um nome de servidor válido.' });
    return;
  }
  const server = createServer(body.data.name, body.data.description, currentUser(response));
  sendToServerMembers(server.id, { type: 'SERVER_CREATE', server });
  response.status(201).json({ server });
});

app.patch(
  '/api/servers/:serverId',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_SERVER),
  (request, response) => {
    const body = serverUpdateSchema.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({ error: 'Servidor inválido — verifique nome, descrição e ícone.' });
      return;
    }
    const result = updateServer(currentServerId(response), body.data);
    if (!result.ok) {
      response.status(404).json({ error: 'Servidor não encontrado.' });
      return;
    }
    sendToServerMembers(result.server.id, { type: 'SERVER_UPDATE', server: result.server });
    response.json({ server: result.server });
  },
);

// Só o dono exclui o servidor (mesmo padrão do Discord real) — Gerenciar
// Servidor sozinho não basta, já que isso é irreversível e apaga tudo em
// cascata (canais, categorias, mensagens, cargos, convites). owner_id nulo
// (servidor órfão, dono com a conta já excluída) cai pra quem tiver Gerenciar
// Servidor, senão o servidor ficaria travado pra sempre sem dono.
app.delete(
  '/api/servers/:serverId',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_SERVER),
  (request, response) => {
    const server = getServerById(currentServerId(response));
    if (!server) {
      response.status(404).json({ error: 'Servidor não encontrado.' });
      return;
    }
    if (server.ownerId && server.ownerId !== currentUser(response).id) {
      response.status(403).json({ error: 'Só o dono do servidor pode excluí-lo.' });
      return;
    }
    const body = serverDeleteSchema.safeParse(request.body);
    if (!body.success || body.data.confirmName !== server.name) {
      response.status(400).json({ error: 'Digite o nome do servidor exatamente igual para confirmar.' });
      return;
    }
    sendToServerMembers(server.id, { type: 'SERVER_DELETE', serverId: server.id });
    deleteServer(server.id);
    response.status(204).end();
  },
);

app.get('/api/servers/:serverId/channels', requireSession, requireServerMembership, (_request, response) => {
  response.json({ channels: listChannelsForServer(currentServerId(response)) });
});

app.get(
  '/api/servers/:serverId/members/me',
  requireSession,
  requireServerMembership,
  (_request, response) => {
    const member = getServerMember(currentServerId(response), currentUser(response).id);
    if (!member) {
      response.status(404).json({ error: 'Servidor não encontrado.' });
      return;
    }
    response.json({ member });
  },
);

app.delete('/api/servers/:serverId/members/me', requireSession, requireServerMembership, (_request, response) => {
  removeServerMember(currentServerId(response), currentUser(response).id);
  sendToServerMembers(currentServerId(response), { type: 'MEMBER_LEAVE', serverId: currentServerId(response), userId: currentUser(response).id });
  response.status(204).end();
});

app.post(
  '/api/servers/:serverId/invite',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_SERVER),
  (_request, response) => {
    const invite = getOrCreateServerInvite(currentServerId(response), currentUser(response).id);
    response.json({ invite });
  },
);

app.post(
  '/api/servers/:serverId/invite/regenerate',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_SERVER),
  (_request, response) => {
    const invite = regenerateServerInvite(currentServerId(response), currentUser(response).id);
    response.json({ invite });
  },
);

app.post('/api/invites/:code/redeem', requireSession, dmChannelLimiter, (request, response) => {
  const code = inviteCodeSchema.safeParse(request.params.code);
  if (!code.success) {
    response.status(404).json({ error: 'Convite não encontrado.' });
    return;
  }
  const user = currentUser(response);
  const result = redeemInvite(code.data, user.id);
  if (!result.ok) {
    response.status(404).json({ error: 'Convite não encontrado.' });
    return;
  }
  const server = getServerById(result.serverId);
  if (!server) {
    response.status(404).json({ error: 'Convite não encontrado.' });
    return;
  }
  if (!result.alreadyMember) {
    const member = listServerMembers(server.id).find((candidate) => candidate.id === user.id);
    if (member) sendToServerMembers(server.id, { type: 'MEMBER_JOIN', serverId: server.id, member });
    sendToUser(user.id, { type: 'SERVER_CREATE', server });
  }
  response.status(result.alreadyMember ? 200 : 201).json({ server });
});

app.get('/api/music/thumbnail', requireSession, async (request, response) => {
  const rawUrl = typeof request.query.url === 'string' ? request.query.url : '';
  try {
    const thumbnail = await fetchMusicThumbnail(rawUrl);
    response.setHeader('Content-Type', thumbnail.contentType);
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.setHeader('Content-Length', thumbnail.body.byteLength);
    response.send(Buffer.from(thumbnail.body));
  } catch (error) {
    console.error('Falha ao carregar thumbnail musical:', error);
    response.status(502).json({ error: 'N\u00e3o foi poss\u00edvel carregar a capa.' });
  }
});

app.get('/api/servers/:serverId/text-channels', requireSession, requireServerMembership, (_request, response) => {
  const serverId = currentServerId(response);
  const channels = filterChannelsByCategoryAccess(serverId, currentUser(response).id, listTextChannels(serverId));
  response.json({ channels });
});

app.get('/api/servers/:serverId/categories', requireSession, requireServerMembership, (_request, response) => {
  response.json({ categories: visibleCategories(currentServerId(response), currentUser(response).id) });
});

const categorySchema = z.object({
  name: z.string().trim().min(1).max(CATEGORY_NAME_MAX_LENGTH).regex(CHANNEL_NAME_PATTERN),
  staffOnly: z.boolean().default(false),
});

app.post(
  '/api/servers/:serverId/categories',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_CHANNELS),
  channelCreateLimiter,
  (request, response) => {
    const serverId = currentServerId(response);
    const body = categorySchema.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({ error: 'Informe um nome de categoria válido.' });
      return;
    }
    const category = createCategory(serverId, body.data.name, body.data.staffOnly);
    sendToServerMembers(serverId, { type: 'CATEGORY_CREATE', serverId, category });
    response.status(201).json({ category });
  },
);

app.patch(
  '/api/servers/:serverId/categories/:categoryId',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_CHANNELS),
  (request, response) => {
    const serverId = currentServerId(response);
    const categoryId = request.params.categoryId;
    const body = categorySchema.partial().safeParse(request.body);
    if (!body.success || typeof categoryId !== 'string') {
      response.status(400).json({ error: 'Dados de categoria inválidos.' });
      return;
    }
    const result = updateCategory(serverId, categoryId, body.data);
    if (!result.ok) {
      response.status(404).json({ error: 'Categoria não encontrada.' });
      return;
    }
    sendToServerMembers(serverId, { type: 'CATEGORY_UPDATE', serverId, category: result.category });
    response.json({ category: result.category });
  },
);

app.delete(
  '/api/servers/:serverId/categories/:categoryId',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_CHANNELS),
  (request, response) => {
    const serverId = currentServerId(response);
    const categoryId = request.params.categoryId;
    const existing = typeof categoryId === 'string' ? getCategoryById(categoryId) : undefined;
    if (!existing || existing.serverId !== serverId) {
      response.status(404).json({ error: 'Categoria não encontrada.' });
      return;
    }
    deleteCategory(categoryId as string);
    sendToServerMembers(serverId, { type: 'CATEGORY_DELETE', serverId, categoryId: categoryId as string });
    response.status(204).end();
  },
);

const categoryPrefsSchema = z.object({
  collapsed: z.boolean().optional(),
  notificationMode: z.enum(['all', 'mentions', 'none']).optional(),
});

app.get('/api/servers/:serverId/category-prefs', requireSession, requireServerMembership, (_request, response) => {
  response.json({ prefs: listCategoryPrefsForUser(currentUser(response).id) });
});

app.patch(
  '/api/servers/:serverId/categories/:categoryId/prefs',
  requireSession,
  requireServerMembership,
  (request, response) => {
    const serverId = currentServerId(response);
    const categoryId = request.params.categoryId;
    const existing = typeof categoryId === 'string' ? getCategoryById(categoryId) : undefined;
    const body = categoryPrefsSchema.safeParse(request.body);
    if (!existing || existing.serverId !== serverId || !body.success) {
      response.status(404).json({ error: 'Categoria não encontrada.' });
      return;
    }
    const prefs = setCategoryPrefs(currentUser(response).id, categoryId as string, body.data);
    response.json({ prefs });
  },
);

app.patch(
  '/api/servers/:serverId/text-channels/:channelId',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_CHANNELS),
  (request, response) => {
    const serverId = currentServerId(response);
    const channelId = request.params.channelId;
    const existing = typeof channelId === 'string' ? getTextChannelById(channelId) : undefined;
    if (!existing || existing.serverId !== serverId) {
      response.status(404).json({ error: 'Canal não encontrado.' });
      return;
    }
    const body = channelSchema.pick({ name: true }).safeParse(request.body);
    if (!body.success) {
      response.status(400).json({ error: 'Informe um nome de canal válido.' });
      return;
    }
    const name = body.data.name.replace(/\s+/g, ' ');
    const duplicate = getTextChannelByName(serverId, name);
    if (duplicate && duplicate.id !== existing.id) {
      response.status(409).json({ error: 'Já existe um canal com esse nome.' });
      return;
    }
    const channel = renameTextChannel(serverId, existing.id, name)!;
    sendToServerMembers(serverId, { type: 'TEXT_CHANNEL_UPDATE', serverId, channel });
    response.json({ channel });
  },
);

const textChannelSettingsSchema = z.object({
  categoryId: z.string().min(1).nullable().optional(),
  topic: z.string().trim().max(CHANNEL_TOPIC_MAX_LENGTH).optional(),
  slowModeSeconds: z.number().int().min(0).max(21_600).optional(),
  contentVisibility: z.enum(['default', 'spoiler', 'age_restricted']).optional(),
  isAnnouncement: z.boolean().optional(),
});

app.patch(
  '/api/servers/:serverId/text-channels/:channelId/settings',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_CHANNELS),
  (request, response) => {
    const serverId = currentServerId(response);
    const channelId = request.params.channelId;
    const existing = typeof channelId === 'string' ? getTextChannelById(channelId) : undefined;
    const body = textChannelSettingsSchema.safeParse(request.body);
    if (!existing || existing.serverId !== serverId || !body.success) {
      response.status(existing ? 400 : 404).json({ error: existing ? 'Configurações inválidas.' : 'Canal não encontrado.' });
      return;
    }
    if (body.data.categoryId) {
      const category = getCategoryById(body.data.categoryId);
      if (!category || category.serverId !== serverId) {
        response.status(400).json({ error: 'Categoria inválida.' });
        return;
      }
    }
    const channel = updateTextChannelSettings(serverId, existing.id, body.data)!;
    sendToServerMembers(serverId, { type: 'TEXT_CHANNEL_UPDATE', serverId, channel });
    response.json({ channel });
  },
);

app.post(
  '/api/servers/:serverId/text-channels',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_CHANNELS),
  channelCreateLimiter,
  (request, response) => {
    const serverId = currentServerId(response);
    const body = channelSchema.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({ error: 'Informe um nome de canal válido.' });
      return;
    }

    const name = body.data.name.replace(/\s+/g, ' ');
    if (getTextChannelByName(serverId, name)) {
      response.status(409).json({ error: 'Já existe um canal com esse nome.' });
      return;
    }
    if (listTextChannels(serverId).length >= 50) {
      response.status(409).json({ error: 'O servidor atingiu o limite de 50 canais de texto.' });
      return;
    }

    const channel = createTextChannel(
      serverId,
      name,
      body.data.description || `Canal #${name}`,
      currentUser(response).id,
    );
    sendToServerMembers(serverId, { type: 'TEXT_CHANNEL_CREATE', serverId, channel });
    response.status(201).json({ channel });
  },
);

app.delete(
  '/api/servers/:serverId/text-channels/:channelId',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_CHANNELS),
  (request, response) => {
    const serverId = currentServerId(response);
    const channelId = request.params.channelId;
    const channel = typeof channelId === 'string' ? getTextChannelById(channelId) : undefined;
    if (!channel || channel.serverId !== serverId) {
      response.status(404).json({ error: 'Canal de texto não encontrado.' });
      return;
    }
    if (listTextChannels(serverId).length <= 1) {
      response.status(409).json({ error: 'O servidor precisa de pelo menos um canal de texto.' });
      return;
    }
    deleteTextChannel(channelId as string);
    sendToServerMembers(serverId, { type: 'TEXT_CHANNEL_DELETE', serverId, channelId: channelId as string });
    response.status(204).end();
  },
);

app.get(
  '/api/servers/:serverId/text-channels/:channelId/messages',
  requireSession,
  requireServerMembership,
  async (request, response) => {
    const channelId = request.params.channelId;
    const channel = typeof channelId === 'string' ? getTextChannelById(channelId) : undefined;
    if (!channel || channel.serverId !== currentServerId(response)) {
      response.status(404).json({ error: 'Canal de texto não encontrado.' });
      return;
    }
    await refreshMusicBotTextMessage(channelId as string);
    response.json({ messages: listTextMessages(channelId as string) });
  },
);

app.post(
  '/api/servers/:serverId/text-channels/:channelId/messages',
  requireSession,
  requireServerMembership,
  textMessageLimiter,
  (request, response) => {
    const serverId = currentServerId(response);
    const channelId = request.params.channelId;
    const channel = typeof channelId === 'string' ? getTextChannelById(channelId) : undefined;
    const body = textMessageSchema.safeParse(request.body);
    if (!channel || channel.serverId !== serverId) {
      response.status(404).json({ error: 'Canal de texto não encontrado.' });
      return;
    }
    if (!body.success || (!body.data.text && !body.data.attachmentIds?.length)) {
      response.status(400).json({ error: 'Envie um texto (até 500 caracteres) ou pelo menos um anexo.' });
      return;
    }
    if (body.data.replyToMessageId && !getTextMessageById(channelId as string, body.data.replyToMessageId)) {
      response.status(404).json({ error: 'Mensagem original não encontrada.' });
      return;
    }
    if (rejectIfTimedOut(serverId, currentUser(response).id, response)) return;

    const canManageMessages = hasPermission(getUserPermissionBitfield(currentUser(response).id, serverId), Permission.MANAGE_MESSAGES);
    if (body.data.postedAsSystem && !canManageMessages) {
      response.status(403).json({ error: 'Você não tem permissão para postar como o servidor.' });
      return;
    }
    const slowModeWait = slowModeRemainingSeconds(channelId as string, currentUser(response).id, canManageMessages);
    if (slowModeWait > 0) {
      response.status(429).json({ error: `Modo lento ativo: aguarde ${slowModeWait}s para enviar outra mensagem.` });
      return;
    }

    const message = createTextMessage(
      channelId as string,
      body.data.text,
      currentUser(response),
      body.data.replyToMessageId,
      body.data.attachmentIds,
      body.data.postedAsSystem,
    );
    sendToServerMembers(serverId, { type: 'TEXT_MESSAGE_CREATE', serverId, channelId: channelId as string, message });
    response.status(201).json({ message });
  },
);

app.patch(
  '/api/servers/:serverId/text-channels/:channelId/messages/:messageId',
  requireSession,
  requireServerMembership,
  textMessageLimiter,
  (request, response) => {
    const serverId = currentServerId(response);
    const channelId = request.params.channelId;
    const messageId = request.params.messageId;
    const channel = typeof channelId === 'string' ? getTextChannelById(channelId) : undefined;
    const body = textMessageSchema.safeParse(request.body);
    if (!channel || channel.serverId !== serverId || typeof messageId !== 'string') {
      response.status(404).json({ error: 'Canal de texto não encontrado.' });
      return;
    }
    if (!body.success || !body.data.text) {
      response.status(400).json({ error: 'A mensagem deve ter entre 1 e 500 caracteres.' });
      return;
    }

    const result = editTextMessage(channelId as string, messageId, body.data.text, currentUser(response).id);
    if (!result.ok) {
      if (result.reason === 'FORBIDDEN') {
        response.status(403).json({ error: 'Você só pode editar suas próprias mensagens.' });
      } else {
        response.status(404).json({ error: 'Mensagem não encontrada.' });
      }
      return;
    }
    sendToServerMembers(serverId, { type: 'TEXT_MESSAGE_UPSERT', serverId, channelId: channelId as string, message: result.message });
    response.json({ message: result.message });
  },
);

app.delete(
  '/api/servers/:serverId/text-channels/:channelId/messages/:messageId',
  requireSession,
  requireServerMembership,
  async (request, response) => {
    const serverId = currentServerId(response);
    const channelId = request.params.channelId;
    const messageId = request.params.messageId;
    const channel = typeof channelId === 'string' ? getTextChannelById(channelId) : undefined;
    if (!channel || channel.serverId !== serverId || typeof messageId !== 'string') {
      response.status(404).json({ error: 'Canal de texto não encontrado.' });
      return;
    }

    const user = currentUser(response);
    const canManageMessages = hasPermission(getUserPermissionBitfield(user.id, serverId), Permission.MANAGE_MESSAGES);
    // Captura os anexos ANTES de apagar — o ON DELETE CASCADE já limpa as
    // linhas de message_attachments junto com a mensagem, então depois não
    // haveria mais como saber quais objetos existiam no MinIO pra remover.
    const attachments = getAttachmentRecordsForMessage(messageId);
    const result = deleteTextMessage(channelId as string, messageId, user.id, canManageMessages);
    if (!result.ok) {
      if (result.reason === 'FORBIDDEN') {
        response.status(403).json({ error: 'Você só pode apagar suas próprias mensagens.' });
      } else {
        response.status(404).json({ error: 'Mensagem não encontrada.' });
      }
      return;
    }
    await Promise.all(
      attachments.map((attachment) =>
        deleteAttachmentObject(attachment.objectKey).catch((error) => {
          console.error(`Falha ao remover objeto de anexo ${attachment.objectKey} do MinIO:`, error);
        }),
      ),
    );
    sendToServerMembers(serverId, { type: 'TEXT_MESSAGE_DELETE', serverId, channelId: channelId as string, messageId });
    response.status(204).end();
  },
);

app.get(
  '/api/servers/:serverId/text-channels/:channelId/messages/pins',
  requireSession,
  requireServerMembership,
  (request, response) => {
    const channelId = request.params.channelId;
    const channel = typeof channelId === 'string' ? getTextChannelById(channelId) : undefined;
    if (!channel || channel.serverId !== currentServerId(response)) {
      response.status(404).json({ error: 'Canal de texto não encontrado.' });
      return;
    }
    response.json({ messages: listPinnedMessages(channelId as string) });
  },
);

app.get(
  '/api/servers/:serverId/text-channels/:channelId/messages/search',
  requireSession,
  requireServerMembership,
  (request, response) => {
    const channelId = request.params.channelId;
    const channel = typeof channelId === 'string' ? getTextChannelById(channelId) : undefined;
    if (!channel || channel.serverId !== currentServerId(response)) {
      response.status(404).json({ error: 'Canal de texto não encontrado.' });
      return;
    }
    const query = messageSearchQuerySchema.safeParse(request.query.q);
    if (!query.success) {
      response.status(400).json({ error: `Digite pelo menos ${MESSAGE_SEARCH_QUERY_MIN_LENGTH} caracteres pra buscar.` });
      return;
    }
    response.json({ messages: searchTextMessages(channelId as string, query.data, MESSAGE_SEARCH_RESULTS_LIMIT) });
  },
);

// Upload em duas etapas (igual o fluxo real do Discord): o arquivo sobe
// pra cá primeiro e fica "pendente" (message_id NULL, ver attachments.ts),
// o cliente já pode pré-visualizar via o mesmo GET /api/attachments/:id/...
// abaixo, e só quando a mensagem de verdade é enviada (POST .../messages
// com attachmentIds) é que o anexo é vinculado. Uploads nunca vinculados são
// varridos periodicamente (ver setInterval mais abaixo).
app.post(
  '/api/servers/:serverId/text-channels/:channelId/attachments',
  requireSession,
  requireServerMembership,
  uploadLimiter,
  handleAttachmentUpload,
  async (request, response) => {
    const serverId = currentServerId(response);
    const channelId = request.params.channelId;
    const channel = typeof channelId === 'string' ? getTextChannelById(channelId) : undefined;
    if (!channel || channel.serverId !== serverId) {
      response.status(404).json({ error: 'Canal de texto não encontrado.' });
      return;
    }
    const user = currentUser(response);
    if (rejectIfTimedOut(serverId, user.id, response)) return;
    if (!request.file) {
      response.status(400).json({ error: 'Nenhum arquivo enviado.' });
      return;
    }

    const filename = sanitizeFilename(request.file.originalname);
    const contentType = request.file.mimetype || 'application/octet-stream';
    const objectKey = `${randomUUID()}/${filename}`;
    try {
      await uploadAttachmentObject(objectKey, request.file.buffer, contentType);
    } catch (error) {
      console.error('Falha ao enviar anexo para o storage de objetos:', error);
      response.status(503).json({ error: 'Não foi possível enviar o arquivo agora. Tente novamente.' });
      return;
    }

    const attachment = createPendingAttachment({
      channelId: channelId as string,
      objectKey,
      filename,
      contentType,
      sizeBytes: request.file.size,
      uploadedBy: user.id,
    });
    response.status(201).json({
      attachment: {
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        url: `/api/attachments/${attachment.id}/${encodeURIComponent(attachment.filename)}`,
      },
    });
  },
);

function buildContentDisposition(disposition: 'inline' | 'attachment', filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// Serve tanto anexos já vinculados a uma mensagem quanto o próprio upload
// pendente de quem acabou de enviar (pré-visualização antes de mandar a
// mensagem). Decide inline vs. download forçado no servidor, nunca confiando
// no que o cliente pediu — é essa política que evita servir um arquivo
// malicioso disfarçado de imagem como HTML/SVG a partir da nossa própria
// origem (ver ATTACHMENT_INLINE_IMAGE_TYPES no pacote compartilhado). Rota
// não aninhada em /api/servers/:serverId (o id do anexo já é globalmente
// único) mas ainda assim exige que o requisitante seja membro do servidor
// dono do canal do anexo — sem isso, qualquer autenticado na instância
// poderia ver anexos de um servidor do qual não faz parte.
app.get('/api/attachments/:attachmentId/:filename', requireSession, async (request, response) => {
  const attachmentId = request.params.attachmentId;
  const attachment = typeof attachmentId === 'string' ? getAttachmentRecordById(attachmentId) : undefined;
  const user = currentUser(response);
  const channel = attachment ? getTextChannelById(attachment.channelId) : undefined;
  if (
    !attachment ||
    !channel ||
    !isServerMember(channel.serverId, user.id) ||
    (attachment.messageId === null && attachment.uploadedBy !== user.id)
  ) {
    response.status(404).json({ error: 'Anexo não encontrado.' });
    return;
  }

  try {
    const objectStream = await getAttachmentObjectStream(attachment.objectKey);
    const inline = (ATTACHMENT_INLINE_IMAGE_TYPES as readonly string[]).includes(attachment.contentType);
    response.setHeader('Content-Type', attachment.contentType);
    response.setHeader('Content-Length', attachment.sizeBytes);
    response.setHeader('Content-Disposition', buildContentDisposition(inline ? 'inline' : 'attachment', attachment.filename));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    objectStream.on('error', (error) => {
      console.error(`Falha ao ler objeto de anexo ${attachment.objectKey} do storage:`, error);
      if (!response.headersSent) response.status(503).end();
    });
    objectStream.pipe(response);
  } catch (error) {
    console.error(`Falha ao buscar anexo ${attachment.objectKey} no storage:`, error);
    response.status(503).json({ error: 'Não foi possível carregar o arquivo agora.' });
  }
});

app.post(
  '/api/servers/:serverId/text-channels/:channelId/messages/:messageId/pin',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_MESSAGES),
  textMessageLimiter,
  (request, response) => {
    const serverId = currentServerId(response);
    const channelId = request.params.channelId;
    const messageId = request.params.messageId;
    const channel = typeof channelId === 'string' ? getTextChannelById(channelId) : undefined;
    if (!channel || channel.serverId !== serverId || typeof messageId !== 'string') {
      response.status(404).json({ error: 'Canal de texto não encontrado.' });
      return;
    }
    const result = pinTextMessage(channelId as string, messageId, currentUser(response).id);
    if (!result.ok) {
      if (result.reason === 'ALREADY_PINNED') {
        response.status(409).json({ error: 'Essa mensagem já está fixada.' });
      } else if (result.reason === 'LIMIT_REACHED') {
        response.status(409).json({ error: 'Esse canal já atingiu o limite de 50 mensagens fixadas.' });
      } else {
        response.status(404).json({ error: 'Mensagem não encontrada.' });
      }
      return;
    }
    sendToServerMembers(serverId, { type: 'TEXT_MESSAGE_UPSERT', serverId, channelId: channelId as string, message: result.message });
    response.json({ message: result.message });
  },
);

app.delete(
  '/api/servers/:serverId/text-channels/:channelId/messages/:messageId/pin',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_MESSAGES),
  textMessageLimiter,
  (request, response) => {
    const serverId = currentServerId(response);
    const channelId = request.params.channelId;
    const messageId = request.params.messageId;
    const channel = typeof channelId === 'string' ? getTextChannelById(channelId) : undefined;
    if (!channel || channel.serverId !== serverId || typeof messageId !== 'string') {
      response.status(404).json({ error: 'Canal de texto não encontrado.' });
      return;
    }
    const result = unpinTextMessage(channelId as string, messageId);
    if (!result.ok) {
      response.status(404).json({ error: 'Essa mensagem não está fixada.' });
      return;
    }
    sendToServerMembers(serverId, { type: 'TEXT_MESSAGE_UPSERT', serverId, channelId: channelId as string, message: result.message });
    response.status(204).end();
  },
);

// Origem = mensagem de canal de texto. O path (:serverId/:channelId) já é o
// mesmo usado por editar/apagar/pin — requireServerMembership já garante que
// quem está pedindo o forward pode mesmo ler essa origem, sem precisar
// reimplementar essa checagem aqui. O destino (corpo da requisição) é
// resolvido do zero por resolveForwardDestination, nunca confiando em nada
// que o cliente afirme sobre a origem alem dos ids já autorizados pelo path.
app.post(
  '/api/servers/:serverId/text-channels/:channelId/messages/:messageId/forward',
  requireSession,
  requireServerMembership,
  textMessageLimiter,
  (request, response) => {
    const serverId = currentServerId(response);
    const channelId = request.params.channelId;
    const messageId = request.params.messageId;
    const channel = typeof channelId === 'string' ? getTextChannelById(channelId) : undefined;
    if (!channel || channel.serverId !== serverId || typeof messageId !== 'string') {
      response.status(404).json({ error: 'Canal de texto não encontrado.' });
      return;
    }
    const source = getTextMessageById(channelId as string, messageId);
    if (!source) {
      response.status(404).json({ error: 'Mensagem não encontrada.' });
      return;
    }
    // Forward nunca copia anexo (ver DISCORD_PARITY_PLAN.md), então uma
    // mensagem só-de-anexo (texto vazio, válido ao criar) resultaria numa
    // mensagem vazia se deixássemos passar.
    if (!source.text.trim()) {
      response.status(400).json({ error: 'Não é possível encaminhar uma mensagem sem texto.' });
      return;
    }
    const body = forwardMessageSchema.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({ error: 'Escolha um destino válido.' });
      return;
    }
    const user = currentUser(response);
    const resolved = resolveForwardDestination(body.data.destination, user.id);
    if (!resolved.ok) {
      response.status(resolved.status).json({ error: resolved.error });
      return;
    }
    const forwardedFrom: ForwardedFromMeta = {
      authorName: source.senderName,
      messageId: source.id,
      serverId,
      channelId: channelId as string,
    };
    if (resolved.kind === 'channel') {
      if (rejectIfTimedOut(resolved.serverId, user.id, response)) return;
      const message = createForwardedTextMessage(resolved.channelId, source.text, user, forwardedFrom);
      sendToServerMembers(resolved.serverId, { type: 'TEXT_MESSAGE_CREATE', serverId: resolved.serverId, channelId: resolved.channelId, message });
      response.status(201).json({ message });
      return;
    }
    if (isBlocked(user.id, resolved.otherUserId)) {
      response.status(403).json({ error: 'Não foi possível enviar a mensagem agora.' });
      return;
    }
    const message = createForwardedDmMessage(resolved.dmChannelId, source.text, user, forwardedFrom);
    sendToUsers([user.id, resolved.otherUserId], { type: 'DM_MESSAGE_CREATE', dmChannelId: resolved.dmChannelId, message });
    response.status(201).json({ message });
  },
);

app.post(
  '/api/servers/:serverId/text-channels/:channelId/messages/:messageId/reactions',
  requireSession,
  requireServerMembership,
  reactionLimiter,
  (request, response) => {
    const serverId = currentServerId(response);
    const channelId = request.params.channelId;
    const messageId = request.params.messageId;
    const channel = typeof channelId === 'string' ? getTextChannelById(channelId) : undefined;
    const body = reactionSchema.safeParse(request.body);
    if (
      !channel ||
      channel.serverId !== serverId ||
      typeof messageId !== 'string' ||
      !getTextMessageById(channelId as string, messageId)
    ) {
      response.status(404).json({ error: 'Mensagem não encontrada.' });
      return;
    }
    if (!body.success) {
      response.status(400).json({ error: 'Emoji não suportado.' });
      return;
    }
    if (rejectIfTimedOut(serverId, currentUser(response).id, response)) return;

    const userId = currentUser(response).id;
    addReaction(messageId, body.data.emoji, userId);
    sendToServerMembers(serverId, { type: 'TEXT_MESSAGE_REACTION_ADD', serverId, channelId: channelId as string, messageId, emoji: body.data.emoji, userId });
    response.status(204).end();
  },
);

app.delete(
  '/api/servers/:serverId/text-channels/:channelId/messages/:messageId/reactions/:emoji',
  requireSession,
  requireServerMembership,
  reactionLimiter,
  (request, response) => {
    const serverId = currentServerId(response);
    const channelId = request.params.channelId;
    const messageId = request.params.messageId;
    const emoji = request.params.emoji;
    const channel = typeof channelId === 'string' ? getTextChannelById(channelId) : undefined;
    if (
      !channel ||
      channel.serverId !== serverId ||
      typeof messageId !== 'string' ||
      !getTextMessageById(channelId as string, messageId) ||
      !isValidReactionEmoji(emoji)
    ) {
      response.status(404).json({ error: 'Mensagem ou reação não encontrada.' });
      return;
    }

    const userId = currentUser(response).id;
    removeReaction(messageId, emoji, userId);
    sendToServerMembers(serverId, { type: 'TEXT_MESSAGE_REACTION_REMOVE', serverId, channelId: channelId as string, messageId, emoji, userId });
    response.status(204).end();
  },
);

// Compartilhada entre GET /api/rooms (fetch inicial/reconexão) e o webhook
// do LiveKit abaixo (que dispara ROOM_STATE_UPDATE via WebSocket sempre que
// alguém entra/sai de voz — sem isso não haveria como saber que o estado
// mudou, já que quem entra direto no LiveKit não passa pela nossa API).
async function computeRoomSummary(channel: VoiceChannel): Promise<RoomSummary> {
  const participants = await roomService.listParticipants(channel.id);
  return {
    ...channel,
    participants: participants.map((participant) => {
      const metadata = parseParticipantMetadata(participant.metadata);
      const microphoneTrack = participant.tracks.find((track) => track.source === TrackSource.MICROPHONE);
      return {
        identity: participant.identity,
        name: participant.name || participant.identity,
        participantType: metadata?.participantType ?? 'HUMAN',
        isSharingScreen: participant.tracks.some((track) => track.source === TrackSource.SCREEN_SHARE),
        isMuted: readSelfMuted(participant.attributes) ?? microphoneTrack?.muted ?? true,
      };
    }),
  };
}

app.get('/api/servers/:serverId/rooms', requireSession, requireServerMembership, async (_request, response) => {
  const serverId = currentServerId(response);
  const channels = filterChannelsByCategoryAccess(serverId, currentUser(response).id, listVoiceChannels(serverId));
  try {
    const activeRoomNames = new Set(
      (await roomService.listRooms(channels.map((channel) => channel.id))).map(
        (room) => room.name,
      ),
    );
    const rooms: RoomSummary[] = await Promise.all(
      channels.map((channel) =>
        activeRoomNames.has(channel.id)
          ? computeRoomSummary(channel)
          : Promise.resolve({ ...channel, participants: [] }),
      ),
    );
    response.json({ rooms, livekitAvailable: true });
  } catch (error) {
    console.error('LiveKit indisponível ao consultar salas:', error);
    response.json({
      rooms: channels.map((channel) => ({ ...channel, participants: [] })),
      livekitAvailable: false,
    });
  }
});

app.patch(
  '/api/servers/:serverId/voice-channels/:channelId',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_CHANNELS),
  (request, response) => {
    const serverId = currentServerId(response);
    const channelId = request.params.channelId;
    const existing = typeof channelId === 'string' ? getVoiceChannelById(channelId) : undefined;
    if (!existing || existing.serverId !== serverId) {
      response.status(404).json({ error: 'Canal não encontrado.' });
      return;
    }
    const body = channelSchema.pick({ name: true }).safeParse(request.body);
    if (!body.success) {
      response.status(400).json({ error: 'Informe um nome de canal válido.' });
      return;
    }
    const name = body.data.name.replace(/\s+/g, ' ');
    const duplicate = getVoiceChannelByName(serverId, name);
    if (duplicate && duplicate.id !== existing.id) {
      response.status(409).json({ error: 'Já existe um canal com esse nome.' });
      return;
    }
    const channel = renameVoiceChannel(serverId, existing.id, name)!;
    sendToServerMembers(serverId, { type: 'VOICE_CHANNEL_UPDATE', serverId, channel });
    response.json({ channel });
  },
);

const voiceChannelSettingsSchema = z.object({
  categoryId: z.string().min(1).nullable().optional(),
  slowModeSeconds: z.number().int().min(0).max(21_600).optional(),
  contentVisibility: z.enum(['default', 'spoiler', 'age_restricted']).optional(),
  bitrateKbps: z.number().int().min(VOICE_BITRATE_MIN_KBPS).max(VOICE_BITRATE_MAX_KBPS).optional(),
  videoQuality: z.enum(['auto', '720p']).optional(),
  userLimit: z.number().int().min(0).max(VOICE_USER_LIMIT_MAX).optional(),
});

app.patch(
  '/api/servers/:serverId/voice-channels/:channelId/settings',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_CHANNELS),
  (request, response) => {
    const serverId = currentServerId(response);
    const channelId = request.params.channelId;
    const existing = typeof channelId === 'string' ? getVoiceChannelById(channelId) : undefined;
    const body = voiceChannelSettingsSchema.safeParse(request.body);
    if (!existing || existing.serverId !== serverId || !body.success) {
      response.status(existing ? 400 : 404).json({ error: existing ? 'Configurações inválidas.' : 'Canal não encontrado.' });
      return;
    }
    if (body.data.categoryId) {
      const category = getCategoryById(body.data.categoryId);
      if (!category || category.serverId !== serverId) {
        response.status(400).json({ error: 'Categoria inválida.' });
        return;
      }
    }
    const channel = updateVoiceChannelSettings(serverId, existing.id, body.data)!;
    sendToServerMembers(serverId, { type: 'VOICE_CHANNEL_UPDATE', serverId, channel });
    response.json({ channel });
  },
);

app.post(
  '/api/servers/:serverId/voice-channels',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_CHANNELS),
  channelCreateLimiter,
  (request, response) => {
    const serverId = currentServerId(response);
    const body = channelSchema.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({ error: 'Informe um nome de canal válido.' });
      return;
    }

    const name = body.data.name.replace(/\s+/g, ' ');
    if (getVoiceChannelByName(serverId, name)) {
      response.status(409).json({ error: 'Já existe um canal de voz com esse nome.' });
      return;
    }
    if (listVoiceChannels(serverId).length >= 50) {
      response.status(409).json({ error: 'O servidor atingiu o limite de 50 canais de voz.' });
      return;
    }

    const channel = createVoiceChannel(serverId, name, body.data.description || `Canal #${name}`, currentUser(response).id);
    sendToServerMembers(serverId, { type: 'VOICE_CHANNEL_CREATE', serverId, channel });
    response.status(201).json({ channel });
  },
);

app.delete(
  '/api/servers/:serverId/voice-channels/:channelId',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_CHANNELS),
  (request, response) => {
    const serverId = currentServerId(response);
    const channelId = request.params.channelId;
    const channel = typeof channelId === 'string' ? getVoiceChannelById(channelId) : undefined;
    if (!channel || channel.serverId !== serverId) {
      response.status(404).json({ error: 'Canal de voz não encontrado.' });
      return;
    }
    if (listVoiceChannels(serverId).length <= 1) {
      response.status(409).json({ error: 'O servidor precisa de pelo menos um canal de voz.' });
      return;
    }
    deleteVoiceChannel(channelId as string);
    sendToServerMembers(serverId, { type: 'VOICE_CHANNEL_DELETE', serverId, channelId: channelId as string });
    response.status(204).end();
  },
);

app.get('/api/servers/:serverId/soundboard', requireSession, requireServerMembership, (_request, response) => {
  response.json({ sounds: listSoundboardSounds(currentServerId(response)) });
});

app.post(
  '/api/servers/:serverId/soundboard',
  requireSession,
  requireServerMembership,
  channelCreateLimiter,
  (request, response) => {
    const serverId = currentServerId(response);
    const body = soundboardSoundSchema.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({ error: 'Som inválido — verifique nome, emoji e duração (máx. 5,5s).' });
      return;
    }
    if (listSoundboardSounds(serverId).length >= 100) {
      response.status(409).json({ error: 'O servidor atingiu o limite de 100 sons no soundboard.' });
      return;
    }
    if (rejectIfTimedOut(serverId, currentUser(response).id, response)) return;

    const sound = createSoundboardSound(
      serverId,
      body.data.name,
      body.data.emoji,
      body.data.audioDataUrl,
      body.data.durationMs,
      currentUser(response),
    );
    sendToServerMembers(serverId, { type: 'SOUNDBOARD_SOUND_CREATE', serverId, sound });
    response.status(201).json({ sound });
  },
);

app.delete('/api/servers/:serverId/soundboard/:soundId', requireSession, requireServerMembership, (request, response) => {
  const serverId = currentServerId(response);
  const soundId = request.params.soundId;
  if (typeof soundId !== 'string' || !getSoundboardSoundById(soundId)) {
    response.status(404).json({ error: 'Som não encontrado.' });
    return;
  }
  const user = currentUser(response);
  const canManageSoundboard = hasPermission(getUserPermissionBitfield(user.id, serverId), Permission.MANAGE_SOUNDBOARD);
  if (!deleteSoundboardSound(soundId, user.id, canManageSoundboard)) {
    response.status(403).json({ error: 'Você só pode apagar sons que você mesmo enviou.' });
    return;
  }
  sendToServerMembers(serverId, { type: 'SOUNDBOARD_SOUND_DELETE', serverId, soundId });
  response.status(204).end();
});

app.get('/api/servers/:serverId/roles', requireSession, requireServerMembership, (_request, response) => {
  response.json({ roles: listRoles(currentServerId(response)) });
});

app.post(
  '/api/servers/:serverId/roles',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_ROLES),
  roleLimiter,
  (request, response) => {
    const serverId = currentServerId(response);
    const body = roleCreateSchema.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({ error: 'Cargo inválido — verifique nome, cor e permissões.' });
      return;
    }
    const requesterPosition = getUserHighestPosition(currentUser(response).id, serverId);
    if (requesterPosition <= 0) {
      response.status(403).json({ error: 'Você precisa de um cargo com posição maior que @everyone para criar cargos.' });
      return;
    }
    if (getRoleByName(serverId, body.data.name)) {
      response.status(409).json({ error: 'Já existe um cargo com esse nome.' });
      return;
    }
    // Todo cargo novo nasce logo abaixo do cargo mais alto de quem criou —
    // sem UI de reordenar posições (fora de escopo, ver DISCORD_PARITY_PLAN.md),
    // isso garante que quem criou sempre consiga editar/apagar o que criou.
    const position = requesterPosition - 1;
    const role = createRole(serverId, body.data.name, body.data.color, body.data.permissions, position, body.data.hoist);
    sendToServerMembers(serverId, { type: 'ROLE_CREATE', serverId, role });
    response.status(201).json({ role });
  },
);

app.patch(
  '/api/servers/:serverId/roles/:roleId',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_ROLES),
  roleLimiter,
  (request, response) => {
    const serverId = currentServerId(response);
    const roleId = request.params.roleId;
    const existing = typeof roleId === 'string' ? getRoleById(roleId) : undefined;
    if (!existing || existing.serverId !== serverId) {
      response.status(404).json({ error: 'Cargo não encontrado.' });
      return;
    }
    const requesterPosition = getUserHighestPosition(currentUser(response).id, serverId);
    if (existing.position >= requesterPosition) {
      response.status(403).json({ error: 'Você só pode editar cargos com posição menor que a sua.' });
      return;
    }
    const body = roleUpdateSchema.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({ error: 'Cargo inválido — verifique nome, cor e permissões.' });
      return;
    }
    if (body.data.name) {
      const duplicate = getRoleByName(serverId, body.data.name);
      if (duplicate && duplicate.id !== existing.id) {
        response.status(409).json({ error: 'Já existe um cargo com esse nome.' });
        return;
      }
    }
    const result = updateRole(roleId as string, body.data);
    if (!result.ok) {
      response.status(404).json({ error: 'Cargo não encontrado.' });
      return;
    }
    sendToServerMembers(serverId, { type: 'ROLE_UPDATE', serverId, role: result.role });
    response.json({ role: result.role });
  },
);

app.delete(
  '/api/servers/:serverId/roles/:roleId',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_ROLES),
  (request, response) => {
    const serverId = currentServerId(response);
    const roleId = request.params.roleId;
    const existing = typeof roleId === 'string' ? getRoleById(roleId) : undefined;
    if (!existing || existing.serverId !== serverId) {
      response.status(404).json({ error: 'Cargo não encontrado.' });
      return;
    }
    const requesterPosition = getUserHighestPosition(currentUser(response).id, serverId);
    if (existing.position >= requesterPosition) {
      response.status(403).json({ error: 'Você só pode apagar cargos com posição menor que a sua.' });
      return;
    }
    const result = deleteRole(roleId as string);
    if (!result.ok) {
      if (result.reason === 'IMMUTABLE') {
        response.status(400).json({ error: 'O cargo @everyone não pode ser apagado.' });
      } else {
        response.status(404).json({ error: 'Cargo não encontrado.' });
      }
      return;
    }
    sendToServerMembers(serverId, { type: 'ROLE_DELETE', serverId, roleId: roleId as string });
    response.status(204).end();
  },
);

app.put(
  '/api/servers/:serverId/roles/:roleId/members/:userId',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_ROLES),
  roleLimiter,
  (request, response) => {
    const serverId = currentServerId(response);
    const roleId = request.params.roleId;
    const userId = request.params.userId;
    const role = typeof roleId === 'string' ? getRoleById(roleId) : undefined;
    const targetIsMember = typeof userId === 'string' && isServerMember(serverId, userId);
    if (!role || role.serverId !== serverId || !targetIsMember || role.isEveryone) {
      response.status(404).json({ error: 'Cargo ou membro não encontrado.' });
      return;
    }
    const requesterPosition = getUserHighestPosition(currentUser(response).id, serverId);
    if (role.position >= requesterPosition) {
      response.status(403).json({ error: 'Você só pode atribuir cargos com posição menor que a sua.' });
      return;
    }
    assignRole(userId as string, roleId as string);
    const roleIds = getUserRoleIds(userId as string, serverId);
    sendToServerMembers(serverId, { type: 'MEMBER_ROLES_UPDATE', serverId, userId: userId as string, roleIds });
    response.status(204).end();
  },
);

app.delete(
  '/api/servers/:serverId/roles/:roleId/members/:userId',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MANAGE_ROLES),
  roleLimiter,
  (request, response) => {
    const serverId = currentServerId(response);
    const roleId = request.params.roleId;
    const userId = request.params.userId;
    const role = typeof roleId === 'string' ? getRoleById(roleId) : undefined;
    if (!role || role.serverId !== serverId || role.isEveryone) {
      response.status(404).json({ error: 'Cargo não encontrado.' });
      return;
    }
    const requesterPosition = getUserHighestPosition(currentUser(response).id, serverId);
    if (role.position >= requesterPosition) {
      response.status(403).json({ error: 'Você só pode remover cargos com posição menor que a sua.' });
      return;
    }
    unassignRole(userId as string, roleId as string);
    const roleIds = getUserRoleIds(userId as string, serverId);
    sendToServerMembers(serverId, { type: 'MEMBER_ROLES_UPDATE', serverId, userId: userId as string, roleIds });
    response.status(204).end();
  },
);

app.get('/api/servers/:serverId/members', requireSession, requireServerMembership, (_request, response) => {
  response.json({ members: listServerMembers(currentServerId(response)) });
});

// Quem, entre os membros deste servidor, está online agora. Só membros veem, e só
// os membros do próprio servidor aparecem (nada de listar a instância inteira).
app.get('/api/servers/:serverId/presence', requireSession, requireServerMembership, (_request, response) => {
  const onlineUserIds = listMemberUserIdsForServer(currentServerId(response)).filter((userId) => presence.isOnline(userId));
  response.json({ onlineUserIds });
});

app.get('/api/friends', requireSession, (_request, response) => {
  const user = currentUser(response);
  const dmChannelByOtherUser = new Map(
    listDmChannelsForUser(user.id).map((channel) => {
      const other = channel.participants.find((participant) => participant.id !== user.id)!;
      return [other.id, channel.id] as const;
    }),
  );
  const friends = listFriends(user.id).map((friend) =>
    dmChannelByOtherUser.has(friend.id) ? { ...friend, dmChannelId: dmChannelByOtherUser.get(friend.id) } : friend,
  );
  response.json({ friends });
});

app.get('/api/friends/requests', requireSession, (_request, response) => {
  const user = currentUser(response);
  response.json({ incoming: listIncomingRequests(user.id), outgoing: listOutgoingRequests(user.id) });
});

app.put('/api/friends/:userId', requireSession, friendLimiter, (request, response) => {
  const targetId = request.params.userId;
  const target = typeof targetId === 'string' ? getUserById(targetId) : undefined;
  if (!target) {
    response.status(404).json({ error: 'Usuário não encontrado.' });
    return;
  }
  const user = currentUser(response);
  const result = sendOrAcceptFriendRequest(user.id, target.id);
  if (!result.ok) {
    const messagesByReason = {
      SELF: 'Você não pode adicionar a si mesmo.',
      BLOCKED: 'Não foi possível enviar o pedido de amizade.',
      ALREADY_REQUESTED: 'Você já enviou um pedido de amizade pra essa pessoa.',
      ALREADY_FRIENDS: 'Vocês já são amigos.',
    } satisfies Record<typeof result.reason, string>;
    const status = result.reason === 'SELF' || result.reason === 'BLOCKED' ? 400 : 409;
    response.status(status).json({ error: messagesByReason[result.reason] });
    return;
  }
  const { status: friendshipStatus, requestedBy } = getFriendshipBetween(user.id, target.id);
  sendToUsers([user.id, target.id], {
    type: 'FRIENDSHIP_UPDATE',
    participantIds: [user.id, target.id],
    status: friendshipStatus,
    requestedBy,
  });
  response.status(result.status === 'ACCEPTED' ? 200 : 201).json({ status: result.status });
});

app.delete('/api/friends/:userId', requireSession, (request, response) => {
  const targetId = request.params.userId;
  const user = currentUser(response);
  if (typeof targetId !== 'string' || !removeFriendship(user.id, targetId).ok) {
    response.status(404).json({ error: 'Relação não encontrada.' });
    return;
  }
  sendToUsers([user.id, targetId], {
    type: 'FRIENDSHIP_UPDATE',
    participantIds: [user.id, targetId],
    status: 'NONE',
    requestedBy: null,
  });
  response.status(204).end();
});

app.get('/api/blocks', requireSession, (_request, response) => {
  response.json({ blocks: listBlockedUsers(currentUser(response).id) });
});

app.put('/api/blocks/:userId', requireSession, friendLimiter, (request, response) => {
  const targetId = request.params.userId;
  const target = typeof targetId === 'string' ? getUserById(targetId) : undefined;
  if (!target) {
    response.status(404).json({ error: 'Usuário não encontrado.' });
    return;
  }
  const user = currentUser(response);
  const result = blockUser(user.id, target.id);
  if (!result.ok) {
    response.status(400).json({ error: 'Você não pode bloquear a si mesmo.' });
    return;
  }
  if (result.friendshipRemoved) {
    sendToUsers([user.id, target.id], {
      type: 'FRIENDSHIP_UPDATE',
      participantIds: [user.id, target.id],
      status: 'NONE',
      requestedBy: null,
    });
  }
  sendToUser(user.id, { type: 'BLOCK_UPDATE', blockedUserId: target.id, blocked: true });
  response.status(204).end();
});

app.delete('/api/blocks/:userId', requireSession, (request, response) => {
  const targetId = request.params.userId;
  const user = currentUser(response);
  if (typeof targetId !== 'string' || !unblockUser(user.id, targetId)) {
    response.status(404).json({ error: 'Você não bloqueou essa pessoa.' });
    return;
  }
  sendToUser(user.id, { type: 'BLOCK_UPDATE', blockedUserId: targetId, blocked: false });
  response.status(204).end();
});

app.get('/api/dm-channels', requireSession, (_request, response) => {
  response.json({ channels: listDmChannelsForUser(currentUser(response).id) });
});

app.put('/api/dm-channels/:userId', requireSession, dmChannelLimiter, (request, response) => {
  const targetId = request.params.userId;
  const target = typeof targetId === 'string' ? getUserById(targetId) : undefined;
  if (!target) {
    response.status(404).json({ error: 'Usuário não encontrado.' });
    return;
  }
  const user = currentUser(response);
  const result = openDmChannel(user.id, target.id);
  if (!result.ok) {
    response.status(403).json({ error: 'Vocês precisam ser amigos pra abrir uma conversa.' });
    return;
  }
  if (result.created) {
    sendToUsers([user.id, target.id], { type: 'DM_CHANNEL_CREATE', channel: result.channel });
  }
  response.status(result.created ? 201 : 200).json({ channel: result.channel });
});

app.get('/api/dm-channels/:dmChannelId/messages', requireSession, (request, response) => {
  const dmChannelId = request.params.dmChannelId;
  const user = currentUser(response);
  const channel = typeof dmChannelId === 'string' ? getDmChannelForParticipant(dmChannelId, user.id) : undefined;
  if (!channel) {
    response.status(404).json({ error: 'Conversa não encontrada.' });
    return;
  }
  response.json({ messages: listDmMessages(channel.id) });
});

app.post('/api/dm-channels/:dmChannelId/messages', requireSession, dmMessageLimiter, (request, response) => {
  const dmChannelId = request.params.dmChannelId;
  const user = currentUser(response);
  const channel = typeof dmChannelId === 'string' ? getDmChannelForParticipant(dmChannelId, user.id) : undefined;
  if (!channel) {
    response.status(404).json({ error: 'Conversa não encontrada.' });
    return;
  }
  const body = dmMessageSchema.safeParse(request.body);
  if (!body.success) {
    response.status(400).json({ error: 'A mensagem deve ter entre 1 e 500 caracteres.' });
    return;
  }
  // Sem gate de timeout aqui de propósito: timeout passou a ser por servidor
  // (ver DISCORD_PARITY_PLAN.md) — silenciar alguém no servidor A não deveria
  // impedir DM, que é uma conversa fora de qualquer servidor.
  const other = channel.participants.find((participant) => participant.id !== user.id)!;
  if (isBlocked(user.id, other.id)) {
    response.status(403).json({ error: 'Não foi possível enviar a mensagem agora.' });
    return;
  }
  const message = createDmMessage(channel.id, body.data.text, user);
  sendToUsers([user.id, other.id], { type: 'DM_MESSAGE_CREATE', dmChannelId: channel.id, message });
  response.status(201).json({ message });
});

app.patch('/api/dm-channels/:dmChannelId/messages/:messageId', requireSession, dmMessageLimiter, (request, response) => {
  const dmChannelId = request.params.dmChannelId;
  const messageId = request.params.messageId;
  const user = currentUser(response);
  const channel = typeof dmChannelId === 'string' ? getDmChannelForParticipant(dmChannelId, user.id) : undefined;
  if (!channel || typeof messageId !== 'string') {
    response.status(404).json({ error: 'Conversa não encontrada.' });
    return;
  }
  const body = dmMessageSchema.safeParse(request.body);
  if (!body.success) {
    response.status(400).json({ error: 'A mensagem deve ter entre 1 e 500 caracteres.' });
    return;
  }
  const result = editDmMessage(channel.id, messageId, body.data.text, user.id);
  if (!result.ok) {
    if (result.reason === 'FORBIDDEN') {
      response.status(403).json({ error: 'Você só pode editar suas próprias mensagens.' });
    } else {
      response.status(404).json({ error: 'Mensagem não encontrada.' });
    }
    return;
  }
  const other = channel.participants.find((participant) => participant.id !== user.id)!;
  sendToUsers([user.id, other.id], { type: 'DM_MESSAGE_UPSERT', dmChannelId: channel.id, message: result.message });
  response.json({ message: result.message });
});

app.delete('/api/dm-channels/:dmChannelId/messages/:messageId', requireSession, (request, response) => {
  const dmChannelId = request.params.dmChannelId;
  const messageId = request.params.messageId;
  const user = currentUser(response);
  const channel = typeof dmChannelId === 'string' ? getDmChannelForParticipant(dmChannelId, user.id) : undefined;
  if (!channel || typeof messageId !== 'string') {
    response.status(404).json({ error: 'Conversa não encontrada.' });
    return;
  }
  const result = deleteDmMessage(channel.id, messageId, user.id);
  if (!result.ok) {
    if (result.reason === 'FORBIDDEN') {
      response.status(403).json({ error: 'Você só pode apagar suas próprias mensagens.' });
    } else {
      response.status(404).json({ error: 'Mensagem não encontrada.' });
    }
    return;
  }
  const other = channel.participants.find((participant) => participant.id !== user.id)!;
  sendToUsers([user.id, other.id], { type: 'DM_MESSAGE_DELETE', dmChannelId: channel.id, messageId });
  response.status(204).end();
});

// Origem = mensagem de DM. getDmChannelForParticipant já resolve existência
// + participação da origem num único 404 genérico, igual toda outra rota de
// mensagem de DM — o destino é resolvido do zero, igual a rota A acima.
app.post('/api/dm-channels/:dmChannelId/messages/:messageId/forward', requireSession, dmMessageLimiter, (request, response) => {
  const dmChannelId = request.params.dmChannelId;
  const messageId = request.params.messageId;
  const user = currentUser(response);
  const channel = typeof dmChannelId === 'string' ? getDmChannelForParticipant(dmChannelId, user.id) : undefined;
  if (!channel || typeof messageId !== 'string') {
    response.status(404).json({ error: 'Conversa não encontrada.' });
    return;
  }
  const source = getDmMessageById(channel.id, messageId);
  if (!source) {
    response.status(404).json({ error: 'Mensagem não encontrada.' });
    return;
  }
  if (!source.text.trim()) {
    response.status(400).json({ error: 'Não é possível encaminhar uma mensagem sem texto.' });
    return;
  }
  const body = forwardMessageSchema.safeParse(request.body);
  if (!body.success) {
    response.status(400).json({ error: 'Escolha um destino válido.' });
    return;
  }
  const resolved = resolveForwardDestination(body.data.destination, user.id);
  if (!resolved.ok) {
    response.status(resolved.status).json({ error: resolved.error });
    return;
  }
  const forwardedFrom: ForwardedFromMeta = { authorName: source.senderName, messageId: source.id, dmChannelId: channel.id };
  if (resolved.kind === 'channel') {
    if (rejectIfTimedOut(resolved.serverId, user.id, response)) return;
    const message = createForwardedTextMessage(resolved.channelId, source.text, user, forwardedFrom);
    sendToServerMembers(resolved.serverId, { type: 'TEXT_MESSAGE_CREATE', serverId: resolved.serverId, channelId: resolved.channelId, message });
    response.status(201).json({ message });
    return;
  }
  if (isBlocked(user.id, resolved.otherUserId)) {
    response.status(403).json({ error: 'Não foi possível enviar a mensagem agora.' });
    return;
  }
  const message = createForwardedDmMessage(resolved.dmChannelId, source.text, user, forwardedFrom);
  sendToUsers([user.id, resolved.otherUserId], { type: 'DM_MESSAGE_CREATE', dmChannelId: resolved.dmChannelId, message });
  response.status(201).json({ message });
});

app.post(
  '/api/servers/:serverId/moderation/timeout',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MODERATE_MEMBERS),
  moderationLimiter,
  async (request, response) => {
    const serverId = currentServerId(response);
    const body = timeoutSchema.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({ error: 'Informe o membro e a duração do timeout (1 a 10080 minutos).' });
      return;
    }
    const user = currentUser(response);
    if (!isServerMember(serverId, body.data.userId)) {
      response.status(404).json({ error: 'Membro não encontrado.' });
      return;
    }
    const requesterPosition = getUserHighestPosition(user.id, serverId);
    const targetPosition = getUserHighestPosition(body.data.userId, serverId);
    const authorization = authorizeModerationAction(user.id, requesterPosition, body.data.userId, targetPosition);
    if (!authorization.ok) {
      response.status(403).json({
        error: authorization.reason === 'SELF'
          ? 'Você não pode aplicar timeout em si mesmo.'
          : 'Você só pode silenciar membros com posição de cargo menor que a sua.',
      });
      return;
    }
    const timeoutUntil = Date.now() + body.data.minutes * 60_000;
    setServerMemberTimeout(serverId, body.data.userId, timeoutUntil);
    await forceDisconnectFromVoice(body.data.userId);
    sendToServerMembers(serverId, { type: 'MEMBER_TIMEOUT_UPDATE', serverId, userId: body.data.userId, timeoutUntil });
    response.json({ timeoutUntil });
  },
);

app.delete(
  '/api/servers/:serverId/moderation/timeout/:userId',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.MODERATE_MEMBERS),
  moderationLimiter,
  (request, response) => {
    const serverId = currentServerId(response);
    const userId = request.params.userId;
    if (typeof userId !== 'string' || !isServerMember(serverId, userId)) {
      response.status(404).json({ error: 'Membro não encontrado.' });
      return;
    }
    const requesterId = currentUser(response).id;
    const requesterPosition = getUserHighestPosition(requesterId, serverId);
    const targetPosition = getUserHighestPosition(userId, serverId);
    const authorization = authorizeModerationAction(requesterId, requesterPosition, userId, targetPosition);
    if (!authorization.ok) {
      response.status(403).json({
        error: authorization.reason === 'SELF'
          ? 'Você não pode remover seu próprio timeout.'
          : 'Você só pode remover timeout de membros com posição de cargo menor que a sua.',
      });
      return;
    }
    setServerMemberTimeout(serverId, userId, null);
    sendToServerMembers(serverId, { type: 'MEMBER_TIMEOUT_UPDATE', serverId, userId, timeoutUntil: null });
    response.status(204).end();
  },
);

// Ban continua de instância inteira, não por servidor (ver
// DISCORD_PARITY_PLAN.md — a tabela `bans` não ganhou server_id, "remover de
// um servidor" é só um DELETE em server_members). Ainda assim, checar a
// PERMISSÃO de banir e a hierarquia de posições exige um servidor de
// referência — por isso `serverId` vem no corpo/query em vez de virar um
// path `/api/servers/:serverId/...` (que sugeriria erroneamente que o ban em
// si é escopado por servidor).
app.get('/api/moderation/bans', requireSession, (request, response) => {
  const serverId = typeof request.query.serverId === 'string' ? request.query.serverId : undefined;
  if (!serverId || !isServerMember(serverId, currentUser(response).id)) {
    response.status(404).json({ error: 'Servidor não encontrado.' });
    return;
  }
  if (!hasPermission(getUserPermissionBitfield(currentUser(response).id, serverId), Permission.BAN_MEMBERS)) {
    response.status(403).json({ error: 'Você não tem permissão para fazer isso.' });
    return;
  }
  response.json({ bans: listBans() });
});

app.post(
  '/api/moderation/bans',
  requireSession,
  moderationLimiter,
  async (request, response) => {
    const body = banSchema.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({ error: 'Informe o membro e o servidor de referência.' });
      return;
    }
    const user = currentUser(response);
    if (!isServerMember(body.data.serverId, user.id)) {
      response.status(404).json({ error: 'Servidor não encontrado.' });
      return;
    }
    if (!hasPermission(getUserPermissionBitfield(user.id, body.data.serverId), Permission.BAN_MEMBERS)) {
      response.status(403).json({ error: 'Você não tem permissão para fazer isso.' });
      return;
    }
    if (!getUserById(body.data.userId)) {
      response.status(404).json({ error: 'Membro não encontrado.' });
      return;
    }
    const requesterPosition = getUserHighestPosition(user.id, body.data.serverId);
    const targetPosition = getUserHighestPosition(body.data.userId, body.data.serverId);
    const authorization = authorizeModerationAction(user.id, requesterPosition, body.data.userId, targetPosition);
    if (!authorization.ok) {
      response.status(403).json({
        error: authorization.reason === 'SELF'
          ? 'Você não pode banir a si mesmo.'
          : 'Você só pode banir membros com posição de cargo menor que a sua.',
      });
      return;
    }
    banUser(body.data.userId, body.data.reason, user.id);
    await forceDisconnectFromVoice(body.data.userId);
    broadcast({ type: 'MEMBER_BANNED', userId: body.data.userId });
    disconnectUser(body.data.userId);
    response.status(204).end();
  },
);

app.delete(
  '/api/moderation/bans/:userId',
  requireSession,
  moderationLimiter,
  (request, response) => {
    const userId = request.params.userId;
    const serverId = typeof request.query.serverId === 'string' ? request.query.serverId : undefined;
    if (!serverId || !isServerMember(serverId, currentUser(response).id)) {
      response.status(404).json({ error: 'Servidor não encontrado.' });
      return;
    }
    if (!hasPermission(getUserPermissionBitfield(currentUser(response).id, serverId), Permission.BAN_MEMBERS)) {
      response.status(403).json({ error: 'Você não tem permissão para fazer isso.' });
      return;
    }
    if (typeof userId !== 'string' || !isBanned(userId)) {
      response.status(404).json({ error: 'Esse membro não está banido.' });
      return;
    }
    unbanUser(userId);
    broadcast({ type: 'MEMBER_UNBANNED', userId });
    response.status(204).end();
  },
);

app.post(
  '/api/servers/:serverId/moderation/voice-kick',
  requireSession,
  requireServerMembership,
  requireServerPermission(Permission.KICK_MEMBERS),
  moderationLimiter,
  async (request, response) => {
    const serverId = currentServerId(response);
    const body = voiceKickSchema.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({ error: 'Informe o membro a ser expulso.' });
      return;
    }
    const user = currentUser(response);
    const requesterPosition = getUserHighestPosition(user.id, serverId);
    const targetPosition = getUserHighestPosition(body.data.userId, serverId);
    const authorization = authorizeModerationAction(user.id, requesterPosition, body.data.userId, targetPosition);
    if (!authorization.ok) {
      response.status(403).json({
        error: authorization.reason === 'SELF'
          ? 'Você não pode expulsar a si mesmo.'
          : 'Você só pode expulsar membros com posição de cargo menor que a sua.',
      });
      return;
    }
    const roomId = await findActiveRoomIdForUser(body.data.userId);
    if (!roomId) {
      response.status(404).json({ error: 'Esse membro não está em nenhuma chamada de voz agora.' });
      return;
    }
    await roomService.removeParticipant(roomId, body.data.userId);
    response.status(204).end();
  },
);

const webhookReceiver = new WebhookReceiver(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
const ROOM_STATE_WEBHOOK_EVENTS = new Set([
  'participant_joined',
  'participant_left',
  // O microfone só é publicado depois da entrada: sem recalcular aqui, quem acabou de entrar
  // ficaria com o ícone de mutado até a próxima entrada ou saída de alguém.
  'track_published',
  'track_unpublished',
  'room_started',
  'room_finished',
]);

app.post('/api/livekit/webhook', express.raw({ type: '*/*' }), async (request, response) => {
  let event;
  try {
    event = await webhookReceiver.receive((request.body as Buffer).toString('utf8'), request.headers.authorization);
  } catch (error) {
    console.error('Webhook do LiveKit rejeitado:', error);
    response.status(401).end();
    return;
  }

  const roomName = event.room?.name;
  const channel = roomName ? getVoiceChannelById(roomName) : undefined;
  if (channel && ROOM_STATE_WEBHOOK_EVENTS.has(event.event)) {
    try {
      const room = event.event === 'room_finished' ? { ...channel, participants: [] } : await computeRoomSummary(channel);
      sendToServerMembers(channel.serverId, { type: 'ROOM_STATE_UPDATE', serverId: channel.serverId, room });
    } catch (error) {
      console.error('Falha ao recalcular estado da sala após webhook:', error);
    }
  }
  response.status(200).end();
});

app.post(
  '/api/servers/:serverId/rooms/:roomId/participants/:identity/disconnect',
  requireSession,
  requireServerMembership,
  async (request, response) => {
  const serverId = currentServerId(response);
  const parsed = disconnectParticipantSchema.safeParse({
    roomId: request.params.roomId,
    identity: request.params.identity,
  });
  const room = parsed.success ? getVoiceChannelById(parsed.data.roomId) : undefined;
  if (!parsed.success || !room || room.serverId !== serverId) {
    response.status(400).json({ error: 'Canal de voz inv\u00e1lido.' });
    return;
  }
  const user = currentUser(response);
  try {
    const participants = await roomService.listParticipants(room.id);
    const authorization = authorizeVoiceDisconnect({
      roomId: room.id,
      channels: listVoiceChannels(serverId),
      requesterId: user.id,
      targetIdentity: parsed.data.identity,
      participantIdentities: participants.map(({ identity }) => identity),
    });
    if (!authorization.ok) {
      if (authorization.reason === 'REQUESTER_NOT_IN_ROOM') {
        response.status(403).json({ error: 'Você precisa estar nesse canal de voz para desconectar alguém.' });
      } else if (authorization.reason === 'TARGET_NOT_IN_ROOM') {
        response.status(404).json({ error: 'Participante não encontrado nesse canal.' });
      } else {
        response.status(400).json({ error: 'Canal de voz inválido.' });
      }
      return;
    }
    const target = participants.find((participant) => participant.identity === parsed.data.identity);
    if (!target) {
      response.status(404).json({ error: 'Participante não encontrado nesse canal.' });
      return;
    }
    if (target.identity === MUSIC_BOT_IDENTITY) {
      const botResponse = await fetch(`${config.MUSIC_BOT_INTERNAL_URL}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: room.id }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!botResponse.ok) {
        // Fallback: força a remoção no LiveKit; o RoomEvent.Disconnected do bot
        // limpa a sessão interna do NexMusic.
        await roomService.removeParticipant(room.id, target.identity);
      }
      for (const clearedChannelId of deleteMusicBotTextMessagesForVoiceChannel(room.id)) {
        sendToServerMembers(serverId, {
          type: 'TEXT_MESSAGE_DELETE',
          serverId,
          channelId: clearedChannelId,
          messageId: `music-bot:${clearedChannelId}`,
        });
      }
    } else {
      await roomService.removeParticipant(room.id, target.identity);
    }
    response.status(204).end();
  } catch (error) {
    console.error('Falha ao desconectar participante:', error);
    response.status(503).json({ error: 'N\u00e3o foi poss\u00edvel desconectar o participante.' });
  }
  },
);

app.post(
  '/api/servers/:serverId/livekit/token',
  requireSession,
  requireServerMembership,
  async (request, response) => {
  const serverId = currentServerId(response);
  const body = tokenSchema.safeParse(request.body);
  const room = body.success ? getVoiceChannelById(body.data.roomId) : undefined;

  if (!body.success || !room || room.serverId !== serverId) {
    response.status(400).json({ error: 'Canal inválido.' });
    return;
  }
  if (rejectIfTimedOut(serverId, currentUser(response).id, response)) return;

  const user = currentUser(response);

  if (room.userLimit > 0) {
    try {
      const participants = await roomService.listParticipants(room.id);
      const alreadyIn = participants.some((participant) => participant.identity === user.id);
      if (!alreadyIn && participants.length >= room.userLimit) {
        response.status(409).json({ error: 'Este canal de voz atingiu o limite de usuários.' });
        return;
      }
    } catch {
      // Sala ainda não existe no LiveKit (ninguém entrou ainda) — sem
      // participantes, então nunca está no limite.
    }
  }
  const metadata: HumanParticipantMetadata = {
    app: 'nexplay',
    participantType: 'HUMAN',
    userId: user.id,
    accentColor: user.accentColor,
    statusText: user.statusText,
    // Atividade (jogo/mídia) é detectada em tempo real pelo app desktop, não
    // dá pra saber no momento de emitir o token — começa nula e é publicada
    // depois via room.localParticipant.setMetadata (por isso canUpdateOwnMetadata).
    activity: null,
  };
  const accessToken = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
    identity: user.id,
    name: user.username,
    ttl: '10m',
    metadata: JSON.stringify(metadata),
  });
  accessToken.addGrant({
    room: room.id,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });

  const payload: LiveKitTokenResponse = {
    token: await accessToken.toJwt(),
    url: config.LIVEKIT_PUBLIC_URL,
  };
  response.json(payload);
  },
);

app.post(
  '/api/servers/:serverId/music/command',
  requireSession,
  requireServerMembership,
  async (request, response) => {
  const serverId = currentServerId(response);
  const body = musicCommandSchema.safeParse(request.body);
  if (!body.success) {
    response.status(400).json({ error: 'Comando musical inválido.' });
    return;
  }

  const textChannel = body.data.textChannelId ? getTextChannelById(body.data.textChannelId) : undefined;
  if (body.data.textChannelId && (!textChannel || textChannel.serverId !== serverId)) {
    response.status(404).json({ error: 'Canal de texto n\u00e3o encontrado.' });
    return;
  }

  const user = currentUser(response);
  try {
    const authorization = await authorizeMusicCommand({
      roomId: body.data.roomId,
      text: body.data.text,
      channels: listVoiceChannels(serverId),
      requester: { id: user.id, displayName: user.username },
      listParticipantIdentities: async (roomName) =>
        (await roomService.listParticipants(roomName)).map(({ identity }) => identity),
    });
    if (!authorization.ok) {
      if (authorization.reason === 'VOICE_REQUIRED') {
        response.status(403).json({ error: 'Você precisa estar em um canal de voz para usar este comando.' });
      } else {
        response.status(400).json({ error: 'Comando musical ou canal inválido.' });
      }
      return;
    }
    console.log(
      `[API] music command authorized room=${authorization.command.channelId} channel=${authorization.command.channelId} user=${user.id}`,
    );

    const botResponse = await fetch(`${config.MUSIC_BOT_INTERNAL_URL}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authorization.command),
      signal: AbortSignal.timeout(30_000),
    });
    if (!botResponse.ok) {
      console.error(`NexMusic rejeitou o comando com status ${botResponse.status}.`);
      response.status(502).json({ error: 'O NexMusic não conseguiu processar o comando.' });
      return;
    }
    const botResult = (await botResponse.json()) as { message?: unknown; nowPlaying?: unknown };
    if (typeof botResult.message !== 'string') {
      response.status(502).json({ error: 'O NexMusic retornou uma resposta inválida.' });
      return;
    }
    let nowPlaying: MusicNowPlayingCard | undefined;
    if (botResult.nowPlaying && typeof botResult.nowPlaying === 'object') {
      nowPlaying = {
        ...(botResult.nowPlaying as MusicNowPlayingCard),
        voiceChannelId: authorization.command.channelId,
      };
    }

    const payload: MusicCommandResponse = nowPlaying
      ? { message: botResult.message, nowPlaying }
      : { message: botResult.message };
    if (body.data.textChannelId) {
      if (nowPlaying) {
        const { message, clearedChannelIds } = upsertMusicBotTextMessage(
          body.data.textChannelId,
          botResult.message,
          nowPlaying,
        );
        payload.textMessage = message;
        sendToServerMembers(serverId, { type: 'TEXT_MESSAGE_UPSERT', serverId, channelId: body.data.textChannelId, message });
        for (const clearedChannelId of clearedChannelIds) {
          sendToServerMembers(serverId, {
            type: 'TEXT_MESSAGE_DELETE',
            serverId,
            channelId: clearedChannelId,
            messageId: `music-bot:${clearedChannelId}`,
          });
        }
      } else if (
        authorization.command.command === 'stop' ||
        authorization.command.command === 'leave' ||
        authorization.command.command === 'nowplaying' ||
        (authorization.command.command === 'skip' && !nowPlaying)
      ) {
        const removed = deleteMusicBotTextMessagesForVoiceChannel(authorization.command.channelId);
        if (removed.length > 0) payload.removeTextMessage = true;
        for (const clearedChannelId of removed) {
          sendToServerMembers(serverId, {
            type: 'TEXT_MESSAGE_DELETE',
            serverId,
            channelId: clearedChannelId,
            messageId: `music-bot:${clearedChannelId}`,
          });
        }
      }
    }
    response.json(payload);
  } catch (error) {
    console.error('Falha ao repassar comando para o NexMusic:', error);
    response.status(503).json({ error: 'O NexMusic está indisponível.' });
    return;
  }
  },
);

app.use((_request, response) => {
  response.status(404).json({ error: 'Rota não encontrada.' });
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  console.error(error);
  response.status(500).json({ error: 'Erro interno do servidor.' });
});

const MUSIC_CARD_RESYNC_INTERVAL_MS = 4_000;
// Mantém os cards de "tocando agora" atualizados (progresso, avanço natural
// de fila) sem o cliente precisar pollar — o único lugar onde ainda existe
// polling no sistema, e ele é inteiramente interno ao servidor agora.
setInterval(() => {
  for (const textChannelId of listActiveMusicBotChannelIds()) {
    void refreshMusicBotTextMessage(textChannelId);
  }
}, MUSIC_CARD_RESYNC_INTERVAL_MS);

const ORPHANED_ATTACHMENT_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 horas
const ORPHANED_ATTACHMENT_SWEEP_INTERVAL_MS = 30 * 60 * 1000;
// Arquivo escolhido/enviado mas cuja mensagem nunca foi mandada (usuário
// fechou a aba, trocou de canal, etc.) fica "pendente" pra sempre se
// ninguém limpar — varre e apaga tanto a linha quanto o objeto no MinIO.
setInterval(() => {
  for (const attachment of listOrphanedAttachments(ORPHANED_ATTACHMENT_MAX_AGE_MS)) {
    deleteAttachmentObject(attachment.objectKey)
      .catch((error) => console.error(`Falha ao limpar anexo órfão ${attachment.objectKey}:`, error))
      .finally(() => deleteAttachmentRecord(attachment.id));
  }
}, ORPHANED_ATTACHMENT_SWEEP_INTERVAL_MS);

const server = app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`NexPlay API ouvindo na porta ${config.PORT}`);
});
void ensureAttachmentsBucket();
attachRealtime(server);
