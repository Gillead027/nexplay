import type { AccountDeletionPreview } from './components/DeleteAccountDialog';
import type {
  AccentColor,
  Activity,
  AvatarFrame,
  BanRecord,
  BlockedUserSummary,
  Category,
  CategoryPrefs,
  Channel,
  ContentVisibility,
  DmCallInfo,
  DmChannel,
  DmMessage,
  ForwardDestination,
  FriendRequestSummary,
  FriendSummary,
  IdentityVerificationStatus,
  Invite,
  LiveKitTokenResponse,
  MemberSummary,
  MessageAttachment,
  ModerationIncidentSummary,
  MusicCommandResponse,
  NotificationMode,
  AdminOverview,
  PendingIdentityVerification,
  PresenceStatus,
  PublicConfig,
  Role,
  RoomSummary,
  Server,
  ServerLayout,
  ServerMember,
  SoundboardSound,
  TextChannel,
  TextMessage,
  TextWebhook,
  UserSession,
  VideoQuality,
  VoiceChannel,
} from '@nexplay/shared';

import { reportSessionExpired } from './sessionExpiry';

interface ApiErrorBody {
  error?: string;
}

// 401 fora de /api/auth/ é sempre "sessão ausente ou expirada" (requireSession).
// Dentro de /api/auth/ o mesmo 401 significa outra coisa — senha errada no
// login, convite inválido no cadastro, senha atual errada na troca — e não
// pode derrubar quem ainda está logado.
function reportIfSessionRejected(path: string, status: number): void {
  if (status === 401 && !path.startsWith('/api/auth/')) reportSessionExpired();
}

// fetch só rejeita (TypeError) quando não chegou ao servidor: sem internet, servidor fora do ar.
// A mensagem original do navegador é em inglês e não diz o que fazer.
// Erro de quem não chegou ao servidor: as telas de mensagem usam o tipo pra oferecer "Tentar de novo".
export class NetworkError extends Error {}

export const NETWORK_ERROR_MESSAGE = 'Sem conexão com o servidor. Verifique sua internet e tente de novo.';

async function networkFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof TypeError) throw new NetworkError(NETWORK_ERROR_MESSAGE);
    throw error;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await networkFetch(path, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    reportIfSessionRejected(path, response.status);
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(body.error || `Falha na requisição (${response.status}).`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// Não reaproveita request(): FormData precisa que o navegador defina o
// Content-Type sozinho (com o boundary do multipart) — forçar
// 'application/json', como o helper acima faz, quebraria o upload.
async function uploadFile<T>(path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append('file', file);
  const response = await networkFetch(path, { method: 'POST', credentials: 'include', body });
  if (!response.ok) {
    reportIfSessionRejected(path, response.status);
    const responseBody = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(responseBody.error || `Falha no envio do arquivo (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

// Igual uploadFile, mas pra verificação manual de identidade (documento + selfie num só envio).
async function uploadTwoFiles<T>(path: string, fields: { document: File; selfie: File }): Promise<T> {
  const body = new FormData();
  body.append('document', fields.document);
  body.append('selfie', fields.selfie);
  const response = await networkFetch(path, { method: 'POST', credentials: 'include', body });
  if (!response.ok) {
    reportIfSessionRejected(path, response.status);
    const responseBody = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(responseBody.error || `Falha no envio dos arquivos (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

const s = (serverId: string) => `/api/servers/${encodeURIComponent(serverId)}`;

export const api = {
  getSession: () => request<{ user: UserSession }>('/api/session'),
  // O servidor diz se o cadastro é aberto (sem código) antes de a tela mostrar o campo do código.
  getRegistrationConfig: () => request<{ open: boolean }>('/api/auth/registration'),
  register: (username: string, password: string, inviteToken: string | undefined, accentColor: AccentColor) =>
    request<{ user: UserSession }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, inviteToken, accentColor }),
    }),
  login: (username: string, password: string) =>
    request<{ user: UserSession }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  deleteSession: () => request<void>('/api/session', { method: 'DELETE' }),
  // Excluir a própria conta (confirmada com a senha) e ver antes o que acontece com os servidores dela.
  getMyDeletionPreview: () => request<AccountDeletionPreview>('/api/me/deletion-preview'),
  deleteMyAccount: (password: string) => request<void>('/api/me', { method: 'DELETE', body: JSON.stringify({ password }) }),
  // Admin da instância apagando a conta de outra pessoa.
  getAdminDeletionPreview: (userId: string) =>
    request<AccountDeletionPreview>(`/api/admin/users/${encodeURIComponent(userId)}/deletion-preview`),
  deleteUserAsAdmin: (userId: string) => request<void>(`/api/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/api/auth/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  // bannerDataUrl e avatarFrame ausentes mantêm o que já está salvo; '' remove a capa / a borda.
  updateProfile: (
    accentColor: AccentColor,
    statusText: string,
    bio: string,
    pronouns: string,
    avatarUrl: string,
    extra: { bannerDataUrl?: string; avatarFrame?: AvatarFrame | '' } = {},
  ) =>
    request<{ user: UserSession }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ accentColor, statusText, bio, pronouns, avatarUrl, ...extra }),
    }),
  getUserAvatar: (userId: string) => request<{ avatarUrl: string; avatarFrame?: AvatarFrame | '' }>(`/api/users/${userId}/avatar`),
  getUserProfile: (userId: string) => request<{ user: UserSession }>(`/api/users/${userId}/profile`),
  getConfig: () => request<PublicConfig>('/api/config'),

  // Verificação de idade/identidade (KYC). 501 quando a instância não tem vendor configurado.
  startIdentityVerification: () => request<{ redirectUrl: string }>('/api/identity-verification/start', { method: 'POST' }),
  getIdentityVerificationStatus: () =>
    request<{ status: IdentityVerificationStatus; verifiedAt: number | null }>('/api/identity-verification/status'),
  // Verificação manual (revisão humana) — só disponível quando identityVerification.mode === 'manual'.
  submitManualIdentityVerification: (document: File, selfie: File) =>
    uploadTwoFiles<{ status: 'pending' }>('/api/identity-verification/manual/submit', { document, selfie }),
  getPendingIdentityVerifications: () =>
    request<{ pending: PendingIdentityVerification[] }>('/api/admin/identity-verification/pending'),
  // URL pra <img src>, não um fetch — a rota exige sessão de admin; o navegador manda o
  // cookie de sessão sozinho numa requisição de imagem de mesma origem.
  identityVerificationImageUrl: (attemptId: string, kind: 'document' | 'selfie') =>
    `/api/admin/identity-verification/${encodeURIComponent(attemptId)}/${kind}`,
  decideIdentityVerification: (attemptId: string, decision: 'verified' | 'rejected', reason?: string) =>
    request<void>(`/api/admin/identity-verification/${encodeURIComponent(attemptId)}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
    }),

  // Fila de confiança e segurança (hoje: autolesão em texto).
  getModerationIncidents: (status: 'open' | 'confirmed' | 'dismissed' = 'open') =>
    request<{ incidents: ModerationIncidentSummary[] }>(`/api/admin/moderation/incidents?status=${status}`),
  resolveModerationIncident: (incidentId: string, decision: 'confirmed' | 'dismissed') =>
    request<void>(`/api/admin/moderation/incidents/${encodeURIComponent(incidentId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),

  // Visão de segurança do admin: só leitura, nunca posta/reage/gerencia — dá pra ver qualquer
  // servidor da instância mesmo sem ser membro dele.
  getAllServersForAdmin: () => request<{ servers: Server[] }>('/api/admin/servers'),
  getServerChannelsForAdmin: (serverId: string) => request<{ channels: Channel[] }>(`/api/admin/servers/${encodeURIComponent(serverId)}/channels`),
  getChannelMessagesForAdmin: (serverId: string, channelId: string) =>
    request<{ messages: TextMessage[] }>(`/api/admin/servers/${encodeURIComponent(serverId)}/text-channels/${encodeURIComponent(channelId)}/messages`),

  // Servidores — fundação de múltiplos servidores (ver DISCORD_PARITY_PLAN.md).
  getServers: () => request<{ servers: Server[] }>('/api/servers'),
  createServer: (name: string, description: string) =>
    request<{ server: Server }>('/api/servers', { method: 'POST', body: JSON.stringify({ name, description }) }),
  updateServer: (serverId: string, patch: { name?: string; description?: string; iconDataUrl?: string; bannerDataUrl?: string; accentColor?: AccentColor | null }) =>
    request<{ server: Server }>(s(serverId), { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteServer: (serverId: string, confirmName: string) =>
    request<void>(s(serverId), { method: 'DELETE', body: JSON.stringify({ confirmName }) }),
  getServerMember: (serverId: string) => request<{ member: ServerMember }>(`${s(serverId)}/members/me`),
  leaveServer: (serverId: string) => request<void>(`${s(serverId)}/members/me`, { method: 'DELETE' }),
  getChannels: (serverId: string) => request<{ channels: Channel[] }>(`${s(serverId)}/channels`),
  getServerInvite: (serverId: string) => request<{ invite: Invite }>(`${s(serverId)}/invite`, { method: 'POST' }),
  regenerateServerInvite: (serverId: string) =>
    request<{ invite: Invite }>(`${s(serverId)}/invite/regenerate`, { method: 'POST' }),
  redeemInvite: (code: string) => request<{ server: Server }>(`/api/invites/${encodeURIComponent(code)}/redeem`, { method: 'POST' }),
  getAdminAccess: () => request<{ admin: boolean }>('/api/admin/access'),
  getAdminOverview: () => request<{ overview: AdminOverview }>('/api/admin/overview'),

  getRooms: (serverId: string) =>
    request<{ rooms: RoomSummary[]; livekitAvailable: boolean }>(`${s(serverId)}/rooms`),
  // Mover alguém de um canal de voz para outro (só quem tem "Mover membros"). A pessoa movida recebe o aviso em tempo real.
  moveVoiceParticipant: (serverId: string, fromRoomId: string, identity: string, toRoomId: string) =>
    request<void>(`${s(serverId)}/rooms/${encodeURIComponent(fromRoomId)}/participants/${encodeURIComponent(identity)}/move`, {
      method: 'POST',
      body: JSON.stringify({ toRoomId }),
    }),
  disconnectVoiceParticipant: (serverId: string, roomId: string, identity: string) =>
    request<void>(`${s(serverId)}/rooms/${encodeURIComponent(roomId)}/participants/${encodeURIComponent(identity)}/disconnect`, {
      method: 'POST',
    }),
  renameChannel: (serverId: string, kind: 'text' | 'voice', channelId: string, name: string) =>
    request<{ channel: TextChannel | VoiceChannel }>(`${s(serverId)}/${kind}-channels/${encodeURIComponent(channelId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  getTextChannels: (serverId: string) => request<{ channels: TextChannel[] }>(`${s(serverId)}/text-channels`),
  createTextChannel: (serverId: string, name: string, description: string) =>
    request<{ channel: TextChannel }>(`${s(serverId)}/text-channels`, {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),
  createVoiceChannel: (serverId: string, name: string, description: string) =>
    request<{ channel: VoiceChannel }>(`${s(serverId)}/voice-channels`, {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),
  deleteVoiceChannel: (serverId: string, channelId: string) =>
    request<void>(`${s(serverId)}/voice-channels/${encodeURIComponent(channelId)}`, { method: 'DELETE' }),
  deleteTextChannel: (serverId: string, channelId: string) =>
    request<void>(`${s(serverId)}/text-channels/${encodeURIComponent(channelId)}`, { method: 'DELETE' }),
  getCategories: (serverId: string) => request<{ categories: Category[] }>(`${s(serverId)}/categories`),
  createCategory: (serverId: string, name: string, staffOnly: boolean) =>
    request<{ category: Category }>(`${s(serverId)}/categories`, {
      method: 'POST',
      body: JSON.stringify({ name, staffOnly }),
    }),
  updateCategory: (serverId: string, categoryId: string, patch: { name?: string; staffOnly?: boolean }) =>
    request<{ category: Category }>(`${s(serverId)}/categories/${encodeURIComponent(categoryId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteCategory: (serverId: string, categoryId: string) =>
    request<void>(`${s(serverId)}/categories/${encodeURIComponent(categoryId)}`, { method: 'DELETE' }),
  getCategoryPrefs: (serverId: string) => request<{ prefs: CategoryPrefs[] }>(`${s(serverId)}/category-prefs`),
  setCategoryPrefs: (
    serverId: string,
    categoryId: string,
    patch: { collapsed?: boolean; notificationMode?: NotificationMode },
  ) =>
    request<{ prefs: CategoryPrefs }>(`${s(serverId)}/categories/${encodeURIComponent(categoryId)}/prefs`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  updateTextChannelSettings: (
    serverId: string,
    channelId: string,
    patch: {
      categoryId?: string | null;
      topic?: string;
      slowModeSeconds?: number;
      contentVisibility?: ContentVisibility;
      isAnnouncement?: boolean;
    },
  ) =>
    request<{ channel: TextChannel }>(`${s(serverId)}/text-channels/${encodeURIComponent(channelId)}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  updateVoiceChannelSettings: (
    serverId: string,
    channelId: string,
    patch: {
      categoryId?: string | null;
      slowModeSeconds?: number;
      contentVisibility?: ContentVisibility;
      bitrateKbps?: number;
      videoQuality?: VideoQuality;
      userLimit?: number;
    },
  ) =>
    request<{ channel: VoiceChannel }>(`${s(serverId)}/voice-channels/${encodeURIComponent(channelId)}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  getTextMessages: (serverId: string, channelId: string) =>
    request<{ messages: TextMessage[] }>(`${s(serverId)}/text-channels/${encodeURIComponent(channelId)}/messages`),
  sendTextMessage: (
    serverId: string,
    channelId: string,
    text: string,
    replyToMessageId?: string,
    attachmentIds?: string[],
    postedAsSystem?: boolean,
  ) =>
    request<{ message: TextMessage }>(`${s(serverId)}/text-channels/${encodeURIComponent(channelId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        text,
        ...(replyToMessageId ? { replyToMessageId } : {}),
        ...(attachmentIds?.length ? { attachmentIds } : {}),
        ...(postedAsSystem ? { postedAsSystem } : {}),
      }),
    }),
  uploadAttachment: (serverId: string, channelId: string, file: File) =>
    uploadFile<{ attachment: MessageAttachment }>(`${s(serverId)}/text-channels/${encodeURIComponent(channelId)}/attachments`, file),
  editTextMessage: (serverId: string, channelId: string, messageId: string, text: string) =>
    request<{ message: TextMessage }>(
      `${s(serverId)}/text-channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
      { method: 'PATCH', body: JSON.stringify({ text }) },
    ),
  deleteTextMessage: (serverId: string, channelId: string, messageId: string) =>
    request<void>(`${s(serverId)}/text-channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    }),
  getPinnedMessages: (serverId: string, channelId: string) =>
    request<{ messages: TextMessage[] }>(`${s(serverId)}/text-channels/${encodeURIComponent(channelId)}/messages/pins`),
  pinMessage: (serverId: string, channelId: string, messageId: string) =>
    request<{ message: TextMessage }>(
      `${s(serverId)}/text-channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/pin`,
      { method: 'POST' },
    ),
  unpinMessage: (serverId: string, channelId: string, messageId: string) =>
    request<void>(`${s(serverId)}/text-channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/pin`, {
      method: 'DELETE',
    }),
  searchMessages: (serverId: string, channelId: string, query: string) =>
    request<{ messages: TextMessage[] }>(
      `${s(serverId)}/text-channels/${encodeURIComponent(channelId)}/messages/search?q=${encodeURIComponent(query)}`,
    ),
  addReaction: (serverId: string, channelId: string, messageId: string, emoji: string) =>
    request<void>(
      `${s(serverId)}/text-channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      { method: 'POST', body: JSON.stringify({ emoji }) },
    ),
  removeReaction: (serverId: string, channelId: string, messageId: string, emoji: string) =>
    request<void>(
      `${s(serverId)}/text-channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`,
      { method: 'DELETE' },
    ),
  forwardTextMessage: (serverId: string, channelId: string, messageId: string, destination: ForwardDestination) =>
    request<{ message: TextMessage | DmMessage }>(
      `${s(serverId)}/text-channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/forward`,
      { method: 'POST', body: JSON.stringify({ destination }) },
    ),
  getLiveKitToken: (serverId: string, roomId: string) =>
    request<LiveKitTokenResponse>(`${s(serverId)}/livekit/token`, {
      method: 'POST',
      body: JSON.stringify({ roomId }),
    }),
  sendMusicCommand: (serverId: string, roomId: string, text: string, textChannelId?: string) =>
    request<MusicCommandResponse>(`${s(serverId)}/music/command`, {
      method: 'POST',
      body: JSON.stringify({ roomId, text, ...(textChannelId ? { textChannelId } : {}) }),
    }),
  getSoundboardSounds: (serverId: string) => request<{ sounds: SoundboardSound[] }>(`${s(serverId)}/soundboard`),
  createSoundboardSound: (serverId: string, name: string, emoji: string, audioDataUrl: string, durationMs: number) =>
    request<{ sound: SoundboardSound }>(`${s(serverId)}/soundboard`, {
      method: 'POST',
      body: JSON.stringify({ name, emoji, audioDataUrl, durationMs }),
    }),
  deleteSoundboardSound: (serverId: string, soundId: string) =>
    request<void>(`${s(serverId)}/soundboard/${encodeURIComponent(soundId)}`, { method: 'DELETE' }),
  getWebhooks: (serverId: string, channelId: string) =>
    request<{ webhooks: TextWebhook[] }>(`${s(serverId)}/text-channels/${encodeURIComponent(channelId)}/webhooks`),
  createWebhook: (serverId: string, channelId: string, name: string, avatarUrl: string) =>
    request<{ webhook: TextWebhook }>(`${s(serverId)}/text-channels/${encodeURIComponent(channelId)}/webhooks`, {
      method: 'POST',
      body: JSON.stringify({ name, avatarUrl }),
    }),
  deleteWebhook: (serverId: string, channelId: string, webhookId: string) =>
    request<void>(`${s(serverId)}/text-channels/${encodeURIComponent(channelId)}/webhooks/${encodeURIComponent(webhookId)}`, {
      method: 'DELETE',
    }),
  getRoles: (serverId: string) => request<{ roles: Role[] }>(`${s(serverId)}/roles`),
  createRole: (serverId: string, name: string, color: string, permissions: number, hoist: boolean) =>
    request<{ role: Role }>(`${s(serverId)}/roles`, {
      method: 'POST',
      body: JSON.stringify({ name, color, permissions, hoist }),
    }),
  updateRole: (serverId: string, roleId: string, patch: { name?: string; color?: string; permissions?: number; hoist?: boolean }) =>
    request<{ role: Role }>(`${s(serverId)}/roles/${encodeURIComponent(roleId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteRole: (serverId: string, roleId: string) =>
    request<void>(`${s(serverId)}/roles/${encodeURIComponent(roleId)}`, { method: 'DELETE' }),
  assignRole: (serverId: string, roleId: string, userId: string) =>
    request<void>(`${s(serverId)}/roles/${encodeURIComponent(roleId)}/members/${encodeURIComponent(userId)}`, { method: 'PUT' }),
  unassignRole: (serverId: string, roleId: string, userId: string) =>
    request<void>(`${s(serverId)}/roles/${encodeURIComponent(roleId)}/members/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    }),
  getMembers: (serverId: string) => request<{ members: MemberSummary[] }>(`${s(serverId)}/members`),
  getPresence: (serverId: string) =>
    request<{ onlineUserIds: string[]; statuses?: Record<string, PresenceStatus>; activities?: Record<string, Activity> }>(`${s(serverId)}/presence`),
  // O que a pessoa está jogando/ouvindo (null = parou), para a lista de membros; ver useShareActivity.
  setActivity: (activity: Activity | null) =>
    request<void>('/api/me/activity', { method: 'PUT', body: JSON.stringify({ activity }) }),
  setPresenceStatus: (status: PresenceStatus) =>
    request<{ presenceStatus: PresenceStatus }>('/api/me/presence', { method: 'PUT', body: JSON.stringify({ status }) }),
  getServerLayout: () => request<{ layout: ServerLayout }>('/api/me/server-layout'),
  saveServerLayout: (layout: ServerLayout) =>
    request<{ layout: ServerLayout }>('/api/me/server-layout', { method: 'PUT', body: JSON.stringify(layout) }),
  // "Digitando…": avisos curtos e descartáveis; um erro aqui nunca deve incomodar quem está escrevendo.
  sendTyping: (serverId: string, channelId: string) =>
    request<void>(`${s(serverId)}/text-channels/${encodeURIComponent(channelId)}/typing`, { method: 'POST' }),
  sendDmTyping: (dmChannelId: string) =>
    request<void>(`/api/dm-channels/${encodeURIComponent(dmChannelId)}/typing`, { method: 'POST' }),
  timeoutMember: (serverId: string, userId: string, minutes: number) =>
    request<{ timeoutUntil: number }>(`${s(serverId)}/moderation/timeout`, {
      method: 'POST',
      body: JSON.stringify({ userId, minutes }),
    }),
  clearMemberTimeout: (serverId: string, userId: string) =>
    request<void>(`${s(serverId)}/moderation/timeout/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  // Ban continua de instância inteira (ver DISCORD_PARITY_PLAN.md), mas
  // checar a permissão de banir exige um servidor de referência.
  getBans: (serverId: string) => request<{ bans: BanRecord[] }>(`/api/moderation/bans?serverId=${encodeURIComponent(serverId)}`),
  banMember: (serverId: string, userId: string, reason: string) =>
    request<void>('/api/moderation/bans', { method: 'POST', body: JSON.stringify({ serverId, userId, reason }) }),
  unbanMember: (serverId: string, userId: string) =>
    request<void>(`/api/moderation/bans/${encodeURIComponent(userId)}?serverId=${encodeURIComponent(serverId)}`, { method: 'DELETE' }),
  voiceKickMember: (serverId: string, userId: string) =>
    request<void>(`${s(serverId)}/moderation/voice-kick`, { method: 'POST', body: JSON.stringify({ userId }) }),

  getFriends: () => request<{ friends: FriendSummary[] }>('/api/friends'),
  getFriendRequests: () =>
    request<{ incoming: FriendRequestSummary[]; outgoing: FriendRequestSummary[] }>('/api/friends/requests'),
  sendFriendRequest: (userId: string) =>
    request<{ status: 'PENDING' | 'ACCEPTED' }>(`/api/friends/${encodeURIComponent(userId)}`, { method: 'PUT' }),
  removeFriendship: (userId: string) =>
    request<void>(`/api/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  getBlocks: () => request<{ blocks: BlockedUserSummary[] }>('/api/blocks'),
  blockUser: (userId: string) => request<void>(`/api/blocks/${encodeURIComponent(userId)}`, { method: 'PUT' }),
  unblockUser: (userId: string) => request<void>(`/api/blocks/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  getDmChannels: () => request<{ channels: DmChannel[] }>('/api/dm-channels'),
  // Ligações individuais (voz entre dois amigos).
  getMyDmCalls: () => request<{ calls: DmCallInfo[] }>('/api/me/dm-calls'),
  startDmCall: (dmChannelId: string) => request<{ call: DmCallInfo }>(`/api/dm-channels/${encodeURIComponent(dmChannelId)}/call`, { method: 'POST' }),
  acceptDmCall: (dmChannelId: string) => request<{ call: DmCallInfo }>(`/api/dm-channels/${encodeURIComponent(dmChannelId)}/call/accept`, { method: 'POST' }),
  declineDmCall: (dmChannelId: string) => request<void>(`/api/dm-channels/${encodeURIComponent(dmChannelId)}/call/decline`, { method: 'POST' }),
  endDmCall: (dmChannelId: string) => request<void>(`/api/dm-channels/${encodeURIComponent(dmChannelId)}/call`, { method: 'DELETE' }),
  getDmCallToken: (dmChannelId: string) => request<LiveKitTokenResponse>(`/api/dm-channels/${encodeURIComponent(dmChannelId)}/call/token`, { method: 'POST' }),
  openDmChannel: (userId: string) =>
    request<{ channel: DmChannel }>(`/api/dm-channels/${encodeURIComponent(userId)}`, { method: 'PUT' }),
  getDmMessages: (dmChannelId: string) =>
    request<{ messages: DmMessage[] }>(`/api/dm-channels/${encodeURIComponent(dmChannelId)}/messages`),
  sendDmMessage: (dmChannelId: string, text: string, attachmentIds?: string[]) =>
    request<{ message: DmMessage }>(`/api/dm-channels/${encodeURIComponent(dmChannelId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text, ...(attachmentIds?.length ? { attachmentIds } : {}) }),
    }),
  uploadDmAttachment: (dmChannelId: string, file: File) =>
    uploadFile<{ attachment: MessageAttachment }>(`/api/dm-channels/${encodeURIComponent(dmChannelId)}/attachments`, file),
  editDmMessage: (dmChannelId: string, messageId: string, text: string) =>
    request<{ message: DmMessage }>(
      `/api/dm-channels/${encodeURIComponent(dmChannelId)}/messages/${encodeURIComponent(messageId)}`,
      { method: 'PATCH', body: JSON.stringify({ text }) },
    ),
  deleteDmMessage: (dmChannelId: string, messageId: string) =>
    request<void>(`/api/dm-channels/${encodeURIComponent(dmChannelId)}/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    }),
  forwardDmMessage: (dmChannelId: string, messageId: string, destination: ForwardDestination) =>
    request<{ message: TextMessage | DmMessage }>(
      `/api/dm-channels/${encodeURIComponent(dmChannelId)}/messages/${encodeURIComponent(messageId)}/forward`,
      { method: 'POST', body: JSON.stringify({ destination }) },
    ),
};
