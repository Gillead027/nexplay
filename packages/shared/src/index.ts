export * from './emoji-data.js';

export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 24;
export const CHAT_MESSAGE_MAX_LENGTH = 500;
export const TEXT_CHANNEL_NAME_MAX_LENGTH = 32;
export const TEXT_CHANNEL_DESCRIPTION_MAX_LENGTH = 120;
export const SERVER_NAME_MAX_LENGTH = 50;
export const SERVER_DESCRIPTION_MAX_LENGTH = 120;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
export const STATUS_TEXT_MAX_LENGTH = 60;
export const BIO_MAX_LENGTH = 300;
export const PRONOUNS_MAX_LENGTH = 30;
export const AVATAR_DATA_URL_MAX_LENGTH = 400_000;
export const BANNER_DATA_URL_MAX_LENGTH = 1_100_000;
export const VOICE_CHAT_TOPIC = 'nexplay-chat';
export const SOUNDBOARD_ANNOUNCE_TOPIC = 'nexplay-soundboard';
export const MUSIC_BOT_IDENTITY = 'music-bot';
export const MUSIC_BOT_DISPLAY_NAME = 'NexMusic';
export const MUSIC_BOT_TRACK_NAME = 'nexmusic-test-tone';
export const MUSIC_PLAY_INPUT_MAX_LENGTH = 300;
export const SOUNDBOARD_NAME_MAX_LENGTH = 32;
export const SOUNDBOARD_AUDIO_DATA_URL_MAX_LENGTH = 600_000;
export const SOUNDBOARD_MAX_DURATION_MS = 5_500;
export const ROLE_NAME_MAX_LENGTH = 32;
export const BAN_REASON_MAX_LENGTH = 300;
export const TIMEOUT_MAX_MINUTES = 10_080; // 7 dias, mesmo teto do Discord real.
export const PINNED_MESSAGES_MAX_PER_CHANNEL = 50; // mesmo teto do Discord real.
export const MESSAGE_SEARCH_QUERY_MIN_LENGTH = 2;
export const MESSAGE_SEARCH_QUERY_MAX_LENGTH = CHAT_MESSAGE_MAX_LENGTH;
export const MESSAGE_SEARCH_RESULTS_LIMIT = 50;
export const ATTACHMENT_MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB — teto razoável pra uma VPS pequena.
export const ATTACHMENT_MAX_PER_MESSAGE = 5;
export const ATTACHMENT_FILENAME_MAX_LENGTH = 200;
// Únicos tipos servidos com Content-Disposition: inline (renderizados como
// <img>). Qualquer outro tipo, mesmo que o navegador reporte um desses no
// upload, é servido como download forçado (ver apps/api/src/index.ts) — é
// essa política no momento de SERVIR, não no upload, que evita servir um
// arquivo malicioso (ex.: SVG com <script>) como HTML/SVG a partir da nossa
// própria origem.
export const ATTACHMENT_INLINE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

// Bitfield de permissões — reduzido (sem herança complexa de categorias/canal
// por permissão, ver DISCORD_PARITY_PLAN.md), mas real: cada flag é checada
// de verdade no backend em apps/api/src/index.ts, não é decorativo.
export const Permission = {
  VIEW_CHANNELS: 1 << 0,
  MANAGE_CHANNELS: 1 << 1,
  MANAGE_ROLES: 1 << 2,
  SEND_MESSAGES: 1 << 3,
  MANAGE_MESSAGES: 1 << 4,
  CONNECT: 1 << 5,
  SPEAK: 1 << 6,
  VIDEO: 1 << 7,
  USE_SOUNDBOARD: 1 << 8,
  MANAGE_SOUNDBOARD: 1 << 9,
  KICK_MEMBERS: 1 << 10,
  BAN_MEMBERS: 1 << 11,
  MODERATE_MEMBERS: 1 << 12,
  ADMINISTRATOR: 1 << 13,
  MANAGE_SERVER: 1 << 14,
} as const;

export type PermissionFlag = (typeof Permission)[keyof typeof Permission];

// O que todo mundo já podia fazer antes de cargos existirem — preserva o
// comportamento atual de produção (qualquer um cria canal, manda mensagem,
// entra em voz, usa o soundboard) sem exigir nenhuma ação do admin depois da
// migração. Kick/ban/timeout/gerenciar cargos/mensagens/soundboard de outros
// continuam exigindo um cargo elevado, porque não existiam antes.
export const DEFAULT_EVERYONE_PERMISSIONS =
  Permission.VIEW_CHANNELS |
  Permission.MANAGE_CHANNELS |
  Permission.SEND_MESSAGES |
  Permission.CONNECT |
  Permission.SPEAK |
  Permission.VIDEO |
  Permission.USE_SOUNDBOARD;

export function hasPermission(bitfield: number, flag: number): boolean {
  return (bitfield & Permission.ADMINISTRATOR) !== 0 || (bitfield & flag) !== 0;
}

export function combinePermissions(...bitfields: number[]): number {
  return bitfields.reduce((combined, value) => combined | value, 0);
}

// "É staff" pra fins de visibilidade de categoria trancada (ver categories.ts
// staffOnly): reaproveita o bitfield de cargos já existente — qualquer
// permissão além do que o @everyone padrão já tinha antes de cargos
// existirem conta como staff. Evita inventar um segundo sistema de
// visibilidade por canal/categoria (ver nota em Permission acima).
export function isStaffTier(bitfield: number): boolean {
  return (bitfield & ~DEFAULT_EVERYONE_PERMISSIONS) !== 0;
}

export interface PermissionDefinition {
  flag: number;
  category: 'Geral' | 'Texto' | 'Voz' | 'Moderação';
  label: string;
  description: string;
}

// Alimenta tanto a validação quanto a lista de checkboxes da UI de cargos
// (ver ServerSettings.tsx) — uma única fonte de verdade, sem duplicar rótulos.
export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  { flag: Permission.ADMINISTRATOR, category: 'Geral', label: 'Administrador', description: 'Concede todas as permissões, ignorando as demais.' },
  { flag: Permission.MANAGE_SERVER, category: 'Geral', label: 'Gerenciar servidor', description: 'Editar nome, descrição e ícone do servidor, e gerenciar o convite.' },
  { flag: Permission.VIEW_CHANNELS, category: 'Geral', label: 'Ver canais', description: 'Ver os canais de texto e voz do servidor.' },
  { flag: Permission.MANAGE_CHANNELS, category: 'Geral', label: 'Gerenciar canais', description: 'Criar e apagar canais de texto e voz.' },
  { flag: Permission.MANAGE_ROLES, category: 'Geral', label: 'Gerenciar cargos', description: 'Criar, editar, apagar e atribuir cargos com posição menor que a sua.' },
  { flag: Permission.SEND_MESSAGES, category: 'Texto', label: 'Enviar mensagens', description: 'Enviar mensagens nos canais de texto.' },
  { flag: Permission.MANAGE_MESSAGES, category: 'Texto', label: 'Gerenciar mensagens', description: 'Apagar mensagens enviadas por outros membros.' },
  { flag: Permission.CONNECT, category: 'Voz', label: 'Conectar', description: 'Entrar em canais de voz.' },
  { flag: Permission.SPEAK, category: 'Voz', label: 'Falar', description: 'Transmitir áudio em canais de voz.' },
  { flag: Permission.VIDEO, category: 'Voz', label: 'Transmitir vídeo', description: 'Ativar câmera e compartilhar tela.' },
  { flag: Permission.USE_SOUNDBOARD, category: 'Voz', label: 'Usar soundboard', description: 'Tocar sons do soundboard durante uma chamada.' },
  { flag: Permission.MANAGE_SOUNDBOARD, category: 'Voz', label: 'Gerenciar soundboard', description: 'Apagar sons enviados por outros membros.' },
  { flag: Permission.KICK_MEMBERS, category: 'Moderação', label: 'Expulsar membros', description: 'Desconectar um membro de qualquer canal de voz, mesmo sem estar na mesma chamada.' },
  { flag: Permission.MODERATE_MEMBERS, category: 'Moderação', label: 'Silenciar membros (timeout)', description: 'Impedir temporariamente que um membro envie mensagens, reaja, use o soundboard ou entre em canais de voz.' },
  { flag: Permission.BAN_MEMBERS, category: 'Moderação', label: 'Banir membros', description: 'Impedir que um membro volte a acessar o servidor.' },
];

export interface Role {
  id: string;
  serverId: string;
  name: string;
  color: string;
  position: number;
  hoist: boolean;
  permissions: number;
  createdAt: number;
  // Convenção: @everyone é sempre seedado com position 0 (menor hierarquia
  // possível, nunca apagável nem reordenável) — computado a partir disso em
  // vez de comparar contra um id fixo, já que cada servidor tem seu próprio
  // cargo @everyone com id gerado (roles.id é chave global, não composta por
  // servidor, então dois servidores nunca podem compartilhar um id de cargo).
  isEveryone: boolean;
}

export interface MemberSummary {
  id: string;
  displayName: string;
  accentColor: AccentColor;
  avatarUrl: string;
  statusText: string;
  roleIds: string[];
  timeoutUntil: number | null;
}

export interface Server {
  id: string;
  name: string;
  description: string;
  iconDataUrl: string;
  // Reaproveita a mesma paleta ACCENT_COLORS de usuários pra "faixa" do
  // perfil do servidor — null = ainda sem cor escolhida.
  accentColor: AccentColor | null;
  ownerId: string | null;
  createdAt: number;
}

export interface ServerMember {
  serverId: string;
  userId: string;
  roleIds: string[];
  permissions: number;
  timeoutUntil: number | null;
  joinedAt: number;
}

export interface Invite {
  code: string;
  serverId: string;
  createdBy: string | null;
  uses: number;
  maxUses: number | null;
  expiresAt: number | null;
  createdAt: number;
}

export interface BanRecord {
  userId: string;
  displayName: string;
  reason: string;
  bannedBy: string | null;
  bannedByName: string | null;
  createdAt: number;
}

export const ACCENT_COLORS = [
  '#4e7960',
  '#5c526b',
  '#566747',
  '#6b5548',
  '#45645f',
  '#684d52',
  '#4a6b8a',
  '#8a5a4a',
] as const;

export type AccentColor = (typeof ACCENT_COLORS)[number];

// Só identidade/perfil de conta — cargos/permissões/timeout deixaram de ser
// instância-inteira e viraram por servidor (ver ServerMember), já que um
// usuário pode ter cargos e um timeout diferentes em cada servidor. O
// cliente busca isso separadamente por servidor ativo (GET
// /api/servers/:serverId/members/me), o mesmo padrão de useFriendsState
// já usado pra amigos/DMs (não embutido na sessão global).
export interface UserSession {
  id: string;
  displayName: string;
  accentColor: AccentColor;
  statusText: string;
  bio: string;
  pronouns: string;
  avatarUrl: string;
  bannerUrl: string;
}

// 'default' = normal; 'spoiler' e 'age_restricted' só guardam o selo visual e
// a intenção — este app não tem gate de confirmação de idade nem
// ocultação-até-clicar de spoiler de fato (ver DISCORD_PARITY_PLAN.md).
export type ContentVisibility = 'default' | 'spoiler' | 'age_restricted';
export type VideoQuality = 'auto' | '720p';
export type NotificationMode = 'all' | 'mentions' | 'none';

export const CATEGORY_NAME_MAX_LENGTH = 32;
export const CHANNEL_TOPIC_MAX_LENGTH = 1024;
// Mesmos degraus do Discord real (subconjunto — o menu completo tem mais
// opções que não valem a complexidade extra aqui).
export const SLOW_MODE_OPTIONS_SECONDS = [0, 5, 10, 15, 30, 60, 300, 600, 900, 1800, 3600, 21600] as const;
export const VOICE_BITRATE_MIN_KBPS = 8;
export const VOICE_BITRATE_MAX_KBPS = 96;
export const VOICE_USER_LIMIT_MAX = 99; // 0 = sem limite ("∞" na UI).

export interface Category {
  id: string;
  serverId: string;
  name: string;
  position: number;
  staffOnly: boolean;
  createdAt: number;
}

export interface CategoryPrefs {
  categoryId: string;
  collapsed: boolean;
  notificationMode: NotificationMode;
}

export interface VoiceChannel {
  id: string;
  serverId: string;
  categoryId: string | null;
  name: string;
  description: string;
  slowModeSeconds: number;
  contentVisibility: ContentVisibility;
  bitrateKbps: number;
  videoQuality: VideoQuality;
  userLimit: number;
  createdBy: string | null;
  createdAt: number;
}

// União discriminada montada só na camada API juntando text_channels e
// voice_channels (duas tabelas SQL físicas separadas de propósito — ver
// DISCORD_PARITY_PLAN.md sobre o risco de colisão de id ao unificá-las
// fisicamente) num único "canais deste servidor" pro cliente consumir.
export type Channel = ({ type: 'TEXT' } & TextChannel) | ({ type: 'VOICE' } & VoiceChannel);

export interface AuthenticatedUserIdentity {
  id: string;
  displayName: string;
}

export type ParticipantType = 'HUMAN' | 'BOT';

export interface PlayingActivity {
  kind: 'playing';
  name: string;
}

export interface ListeningActivity {
  kind: 'listening';
  app: string;
  title: string;
  artist: string;
  // Capa do álbum já reduzida a um thumbnail pequeno pelo app desktop (ver
  // apps/desktop/src/activity.ts) — cabe tranquilamente no metadata do
  // participante do LiveKit. Ausente quando o app de origem não publica arte.
  thumbnailDataUrl?: string;
  // positionMs é uma amostra pontual tirada em updatedAt (epoch ms), não um
  // valor ao vivo — quem exibe a barra de progresso projeta o tempo decorrido
  // como positionMs + (Date.now() - updatedAt) em vez de reenviar a posição a
  // cada segundo, o que inundaria o metadata do LiveKit com atualizações.
  positionMs?: number;
  durationMs?: number;
  updatedAt?: number;
}

export type Activity = PlayingActivity | ListeningActivity;

export interface HumanParticipantMetadata {
  app: 'nexplay';
  participantType: 'HUMAN';
  userId: string;
  accentColor: AccentColor;
  statusText: string;
  // Detectada localmente pelo app desktop (jogo em execução / mídia tocando
  // no Windows) e publicada ao vivo via room.localParticipant.setMetadata —
  // por isso é sempre null no metadata inicial do token (ver apps/api).
  activity: Activity | null;
}

export interface BotParticipantMetadata {
  // 'sausixudos' aceito por compatibilidade: apps/music-bot ainda não foi
  // migrado pro rebrand NexPlay (trabalho próprio em andamento não
  // relacionado) e continua construindo essa tag antiga. Remover a união
  // quando o music-bot for migrado separadamente (ver parseParticipantMetadata).
  app: 'nexplay' | 'sausixudos';
  participantType: 'BOT';
  botId: typeof MUSIC_BOT_IDENTITY;
}

export type ParticipantMetadata = HumanParticipantMetadata | BotParticipantMetadata;

function parseActivity(value: unknown): Activity | null {
  if (!value || typeof value !== 'object') return null;
  const activity = value as Record<string, unknown>;
  if (activity.kind === 'playing' && typeof activity.name === 'string') {
    return { kind: 'playing', name: activity.name };
  }
  if (
    activity.kind === 'listening' &&
    typeof activity.app === 'string' &&
    typeof activity.title === 'string' &&
    typeof activity.artist === 'string'
  ) {
    return {
      kind: 'listening',
      app: activity.app,
      title: activity.title,
      artist: activity.artist,
      ...(typeof activity.thumbnailDataUrl === 'string' ? { thumbnailDataUrl: activity.thumbnailDataUrl } : {}),
      ...(typeof activity.positionMs === 'number' ? { positionMs: activity.positionMs } : {}),
      ...(typeof activity.durationMs === 'number' ? { durationMs: activity.durationMs } : {}),
      ...(typeof activity.updatedAt === 'number' ? { updatedAt: activity.updatedAt } : {}),
    };
  }
  return null;
}

export function parseParticipantMetadata(value: string | undefined): ParticipantMetadata | null {
  if (!value) return null;
  try {
    const metadata = JSON.parse(value) as Record<string, unknown>;
    // 'sausixudos' aceito por compatibilidade: apps/music-bot ainda não foi
    // migrado pro rebrand NexPlay (tem trabalho próprio em andamento não
    // relacionado) e continua publicando essa tag antiga no metadata do
    // participante do LiveKit. Remover esse fallback quando o music-bot for
    // migrado separadamente.
    if (metadata.app !== 'nexplay' && metadata.app !== 'sausixudos') return null;
    if (
      metadata.participantType === 'BOT' &&
      metadata.botId === MUSIC_BOT_IDENTITY
    ) {
      return {
        app: 'nexplay',
        participantType: 'BOT',
        botId: MUSIC_BOT_IDENTITY,
      };
    }
    if (
      metadata.participantType === 'HUMAN' &&
      typeof metadata.userId === 'string' &&
      typeof metadata.accentColor === 'string' &&
      (ACCENT_COLORS as readonly string[]).includes(metadata.accentColor) &&
      typeof metadata.statusText === 'string'
    ) {
      return {
        app: 'nexplay',
        participantType: 'HUMAN',
        userId: metadata.userId,
        accentColor: metadata.accentColor as AccentColor,
        statusText: metadata.statusText,
        activity: parseActivity(metadata.activity),
      };
    }
  } catch {
    // Metadata externa ou malformada não deve quebrar a lista de participantes.
  }
  return null;
}

export const MUSIC_COMMAND_ALIASES = {
  'play-file': 'play-file',
  'play-local': 'play-local',
  play: 'play',
  playlist: 'playlist',
  history: 'history',
  pause: 'pause',
  resume: 'resume',
  skip: 'skip',
  stop: 'stop',
  leave: 'leave',
  queue: 'queue',
  nowplaying: 'nowplaying',
  np: 'nowplaying',
  volume: 'volume',
  clear: 'clear',
} as const;

export type MusicCommandName = (typeof MUSIC_COMMAND_ALIASES)[keyof typeof MUSIC_COMMAND_ALIASES];
export type MusicCommandPrefix = '/' | '!';

export interface MusicCommandArgsByName {
  'play-file': Record<never, never>;
  'play-local': Record<never, never>;
  play: { input: string };
  playlist: { input: string };
  history: Record<never, never>;
  pause: Record<never, never>;
  resume: Record<never, never>;
  skip: Record<never, never>;
  stop: Record<never, never>;
  leave: Record<never, never>;
  queue: Record<never, never>;
  nowplaying: Record<never, never>;
  volume: { volume: number };
  clear: Record<never, never>;
}

export type ParsedMusicCommand = {
  [Name in MusicCommandName]: {
    name: Name;
    prefix: MusicCommandPrefix;
    args: MusicCommandArgsByName[Name];
  };
}[MusicCommandName];

/** Normaliza aliases e argumentos; a API ainda valida autenticação e voice state. */
export function parseMusicCommand(value: string): ParsedMusicCommand | null {
  const match = /^([/!])([a-z-]+)(?:\s+(.+))?$/i.exec(value.trim());
  if (!match) return null;
  const prefix = match[1] as MusicCommandPrefix;
  const alias = match[2]?.toLowerCase() as keyof typeof MUSIC_COMMAND_ALIASES | undefined;
  if (!alias || !Object.hasOwn(MUSIC_COMMAND_ALIASES, alias)) return null;
  const name = MUSIC_COMMAND_ALIASES[alias];
  const rawArgs = match[3]?.trim();

  if (name === 'play' || name === 'playlist') {
    if (!rawArgs || rawArgs.length > MUSIC_PLAY_INPUT_MAX_LENGTH) return null;
    return { name, prefix, args: { input: rawArgs } };
  }

  if (name === 'volume') {
    if (!rawArgs || !/^\d+$/.test(rawArgs)) return null;
    const volume = Number(rawArgs);
    if (!Number.isInteger(volume) || volume < 0 || volume > 100) return null;
    return { name, prefix, args: { volume } };
  }

  if (rawArgs) return null;
  return { name, prefix, args: {} } as ParsedMusicCommand;
}

/**
 * Detecção leve para composers. A API continua responsável por autenticar o
 * usuário, validar o voice state e normalizar o comando definitivamente.
 */
export function isMusicCommandInput(value: string): boolean {
  const match = /^[/!]([a-z-]+)/i.exec(value.trim());
  const alias = match?.[1]?.toLowerCase();
  return Boolean(alias && Object.hasOwn(MUSIC_COMMAND_ALIASES, alias));
}

export interface MusicNowPlayingCard {
  title: string;
  author: string;
  providerId: string;
  durationMs: number;
  positionMs: number;
  requestedBy: string;
  state: string;
  volume: number;
  queueSize?: number;
  voiceChannelId?: string;
  thumbnailUrl?: string;
  webUrl?: string;
}

export interface MusicCommandResponse {
  message: string;
  nowPlaying?: MusicNowPlayingCard;
  textMessage?: TextMessage;
  removeTextMessage?: boolean;
}

/** Contrato interno usado pela API para encaminhar um comando autenticado ao NexMusic. */
interface MusicBotCommandRequestBase {
  channelId: string;
  requestedBy: AuthenticatedUserIdentity;
}

export type MusicBotCommandRequest = {
  [Name in MusicCommandName]: MusicBotCommandRequestBase & {
    command: Name;
    args: MusicCommandArgsByName[Name];
  };
}[MusicCommandName];

export function isMusicBotCommandRequest(value: unknown): value is MusicBotCommandRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MusicBotCommandRequest>;
  if (
    typeof candidate.channelId === 'string' &&
    typeof candidate.command === 'string' &&
    (Object.values(MUSIC_COMMAND_ALIASES) as string[]).includes(candidate.command) &&
    typeof candidate.args === 'object' &&
    candidate.args !== null &&
    typeof candidate.requestedBy === 'object' &&
    candidate.requestedBy !== null &&
    typeof candidate.requestedBy.id === 'string' &&
    typeof candidate.requestedBy.displayName === 'string'
  ) {
    if (candidate.command === 'play' || candidate.command === 'playlist') {
      const input = (candidate.args as { input?: unknown }).input;
      return Object.keys(candidate.args).length === 1 && typeof input === 'string' && input.trim().length > 0 && input.length <= MUSIC_PLAY_INPUT_MAX_LENGTH;
    }
    if (candidate.command === 'volume') {
      const volume = (candidate.args as { volume?: unknown }).volume;
      return (
        Object.keys(candidate.args).length === 1 &&
        Number.isInteger(volume) &&
        (volume as number) >= 0 &&
        (volume as number) <= 100
      );
    }
    return Object.keys(candidate.args).length === 0;
  }
  return false;
}

// Formato cru do env var VOICE_CHANNELS, usado só pra semear o servidor
// padrão no primeiro boot (ver db.ts) — sem server_id/createdBy/createdAt
// porque nesse momento o servidor padrão pode nem existir ainda.
export interface VoiceChannelSeed {
  id: string;
  name: string;
  description: string;
}

/** Mantém API e serviços usando a mesma definição dos canais de voz. */
export function parseVoiceChannels(value: string): VoiceChannelSeed[] {
  const channels = value.split(',').map((entry) => {
    const [rawId, rawName, ...descriptionParts] = entry.split(':');
    const id = rawId?.trim() ?? '';
    const name = rawName?.trim() ?? '';
    const description = descriptionParts.join(':').trim();

    if (!/^[a-z0-9-]{1,32}$/.test(id) || !name || !description) {
      throw new Error(
        `Canal inválido "${entry}". Use id:nome:descrição e apenas a-z, 0-9 ou hífen no id.`,
      );
    }

    return { id, name, description };
  });

  if (channels.length === 0 || new Set(channels.map(({ id }) => id)).size !== channels.length) {
    throw new Error('VOICE_CHANNELS deve conter canais com ids únicos.');
  }

  return channels;
}

export interface RoomParticipantSummary {
  identity: string;
  name: string;
  participantType: ParticipantType;
  isSharingScreen: boolean;
  isMuted: boolean;
}

export interface RoomSummary extends VoiceChannel {
  participants: RoomParticipantSummary[];
}

// Canais deixaram de vir daqui — cada servidor tem os seus, buscados via
// GET /api/servers/:serverId/channels (ver Channel acima).
export interface PublicConfig {
  livekitUrl: string;
}

export interface LiveKitTokenResponse {
  token: string;
  url: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
  musicCard?: MusicNowPlayingCard;
}

export interface SoundboardSound {
  id: string;
  name: string;
  emoji: string;
  // data: URL de áudio curto (≤ SOUNDBOARD_AUDIO_DATA_URL_MAX_LENGTH) —
  // mesmo padrão de avatar/banner, sem storage de objetos separado (ver
  // DISCORD_PARITY_PLAN.md). durationMs é só o que o navegador do autor
  // mediu na hora do upload, usado pra exibir e pra saber quando parar de
  // publicar a faixa temporária no LiveKit ao tocar.
  audioDataUrl: string;
  durationMs: number;
  createdBy: string;
  createdByName: string;
  createdAt: number;
}

// Publicado no canal de dados do LiveKit (mesmo mecanismo do chat de voz)
// quando alguém toca um som — o áudio em si chega pra todo mundo via uma
// track de verdade publicada pelo próprio autor (ver useVoiceRoom.ts),
// então isso é só pra mostrar "Fulano tocou 🔔 Nome do som" na UI de quem
// já está na call.
export interface SoundboardAnnouncement {
  soundId: string;
  soundName: string;
  emoji: string;
}

export interface MessageAttachment {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  // Caminho relativo (mesma origem) — GET /api/attachments/:id/:filename,
  // decide inline vs. download forçado no servidor conforme contentType.
  url: string;
}

export interface TextChannel {
  id: string;
  serverId: string;
  categoryId: string | null;
  name: string;
  description: string;
  topic: string;
  slowModeSeconds: number;
  contentVisibility: ContentVisibility;
  isAnnouncement: boolean;
  createdBy: string | null;
  createdAt: number;
}

export interface MessageReactionGroup {
  emoji: string;
  userIds: string[];
}

// Encaminhamento (forward): ao contrário de replyToMessageId (só id, resolve
// contra mensagens já carregadas), o autor do forward normalmente NÃO tem
// acesso ao canal/servidor/DM de origem — por isso forwardedFromAuthorName é
// um snapshot congelado no momento do envio, nunca atualizado depois. Os ids
// (forwardedFromMessageId + um entre forwardedFromChannelId/serverId OU
// forwardedFromDmChannelId) são só de melhor esforço, sem FK, sem UI de "ir
// pra mensagem original" ainda — podem apontar pra algo apagado/inacessível.
export interface ForwardedFromFields {
  forwardedFromAuthorName?: string;
  forwardedFromMessageId?: string;
  forwardedFromServerId?: string; // só se a origem era mensagem de canal
  forwardedFromChannelId?: string; // só se a origem era mensagem de canal
  forwardedFromDmChannelId?: string; // só se a origem era mensagem de DM
}

// Corpo de POST .../forward — resolvido no backend por
// resolveForwardDestination (apps/api/src/forwardDestination.ts).
export type ForwardDestination =
  | { kind: 'channel'; serverId: string; channelId: string }
  | { kind: 'dm'; dmChannelId: string };

// Metadado de origem já resolvido pela rota antes de criar a mensagem nova —
// não é um tipo de mensagem em si, vira ForwardedFromFields ao gravar.
export interface ForwardedFromMeta {
  authorName: string;
  messageId: string;
  serverId?: string;
  channelId?: string;
  dmChannelId?: string;
}

// SYSTEM é só pra mensagens postadas com a identidade do servidor (ver
// PATCH .../messages/system, gated por MANAGE_MESSAGES) — nunca corresponde
// a um participante de voz de verdade, por isso é um type à parte do
// ParticipantType usado pelo LiveKit, não uma extensão dele.
export type TextMessageSenderType = ParticipantType | 'SYSTEM';

export interface TextMessage extends ForwardedFromFields {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderType: TextMessageSenderType;
  // Só populado quando senderType === 'SYSTEM' (ícone do servidor) — mensagens
  // HUMAN resolvem avatar pelo próprio senderId (ver useTextAvatar no cliente).
  senderAvatarUrl?: string;
  text: string;
  sentAt: number;
  editedAt?: number;
  musicCard?: MusicNowPlayingCard;
  reactions?: MessageReactionGroup[];
  // Só o id — sem snapshot congelado do texto original. O cliente resolve o
  // preview olhando a mensagem já carregada na conversa (reflete edição ao
  // vivo, igual o Discord de verdade); se não achar (fora da janela
  // carregada, ou apagada), mostra um placeholder de "mensagem original".
  replyToMessageId?: string;
  pinnedAt?: number;
  attachments?: MessageAttachment[];
}

// Amizade é sempre entre 2 usuários — RawFriendshipStatus é o dado bruto tal
// como fica no banco/evento de tempo real (linha existe ou não, e se existe
// quem foi que pediu) — usado só entre servidor e o payload do WebSocket.
// FriendshipStatus é a mesma informação já resolvida do ponto de vista de UM
// usuário específico (o cliente deriva isso comparando o id de outro usuário
// contra as listas já carregadas de amigos/pedidos — ver Friends.tsx).
export type RawFriendshipStatus = 'NONE' | 'PENDING' | 'ACCEPTED';
export type FriendshipStatus = 'NONE' | 'PENDING_OUTGOING' | 'PENDING_INCOMING' | 'ACCEPTED';

export interface FriendSummary {
  id: string;
  displayName: string;
  accentColor: AccentColor;
  avatarUrl: string;
  statusText: string;
  since: number;
  dmChannelId?: string;
}

export interface FriendRequestSummary {
  userId: string;
  displayName: string;
  accentColor: AccentColor;
  avatarUrl: string;
  createdAt: number;
}

export interface BlockedUserSummary {
  userId: string;
  displayName: string;
  accentColor: AccentColor;
  avatarUrl: string;
  createdAt: number;
}

export interface DmChannelParticipant {
  id: string;
  displayName: string;
  accentColor: AccentColor;
  avatarUrl: string;
}

export interface DmChannel {
  id: string;
  participants: [DmChannelParticipant, DmChannelParticipant];
  createdAt: number;
  lastMessageAt: number | null;
}

export interface DmMessage extends ForwardedFromFields {
  id: string;
  dmChannelId: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
  editedAt?: number;
}

// Eventos empurrados pelo WebSocket da API (ver apps/api/src/realtime.ts) —
// substituem os antigos loops de polling de mensagens/salas/canais no
// cliente web. Uma única união discriminada mantém servidor e cliente no
// mesmo contrato sem precisar de um gerador de esquema à parte.
export type RealtimeEvent =
  | { type: 'TEXT_MESSAGE_CREATE'; serverId: string; channelId: string; message: TextMessage }
  | { type: 'TEXT_MESSAGE_UPSERT'; serverId: string; channelId: string; message: TextMessage }
  | { type: 'TEXT_MESSAGE_DELETE'; serverId: string; channelId: string; messageId: string }
  | { type: 'TEXT_CHANNEL_CREATE'; serverId: string; channel: TextChannel }
  | { type: 'TEXT_CHANNEL_UPDATE'; serverId: string; channel: TextChannel }
  | { type: 'TEXT_CHANNEL_DELETE'; serverId: string; channelId: string }
  | { type: 'VOICE_CHANNEL_CREATE'; serverId: string; channel: VoiceChannel }
  | { type: 'VOICE_CHANNEL_UPDATE'; serverId: string; channel: VoiceChannel }
  | { type: 'VOICE_CHANNEL_DELETE'; serverId: string; channelId: string }
  | { type: 'CATEGORY_CREATE'; serverId: string; category: Category }
  | { type: 'CATEGORY_UPDATE'; serverId: string; category: Category }
  | { type: 'CATEGORY_DELETE'; serverId: string; categoryId: string }
  | { type: 'ROOM_STATE_UPDATE'; serverId: string; room: RoomSummary }
  | { type: 'TEXT_MESSAGE_REACTION_ADD'; serverId: string; channelId: string; messageId: string; emoji: string; userId: string }
  | { type: 'TEXT_MESSAGE_REACTION_REMOVE'; serverId: string; channelId: string; messageId: string; emoji: string; userId: string }
  | { type: 'SOUNDBOARD_SOUND_CREATE'; serverId: string; sound: SoundboardSound }
  | { type: 'SOUNDBOARD_SOUND_DELETE'; serverId: string; soundId: string }
  | { type: 'ROLE_CREATE'; serverId: string; role: Role }
  | { type: 'ROLE_UPDATE'; serverId: string; role: Role }
  | { type: 'ROLE_DELETE'; serverId: string; roleId: string }
  | { type: 'MEMBER_ROLES_UPDATE'; serverId: string; userId: string; roleIds: string[] }
  | { type: 'MEMBER_TIMEOUT_UPDATE'; serverId: string; userId: string; timeoutUntil: number | null }
  | { type: 'MEMBER_JOIN'; serverId: string; member: MemberSummary }
  | { type: 'MEMBER_LEAVE'; serverId: string; userId: string }
  | { type: 'MEMBER_BANNED'; userId: string }
  | { type: 'MEMBER_UNBANNED'; userId: string }
  | { type: 'SERVER_CREATE'; server: Server }
  | { type: 'SERVER_UPDATE'; server: Server }
  | { type: 'FRIENDSHIP_UPDATE'; participantIds: [string, string]; status: RawFriendshipStatus; requestedBy: string | null }
  | { type: 'DM_CHANNEL_CREATE'; channel: DmChannel }
  | { type: 'DM_MESSAGE_CREATE'; dmChannelId: string; message: DmMessage }
  | { type: 'DM_MESSAGE_UPSERT'; dmChannelId: string; message: DmMessage }
  | { type: 'DM_MESSAGE_DELETE'; dmChannelId: string; messageId: string }
  | { type: 'BLOCK_UPDATE'; blockedUserId: string; blocked: boolean };
