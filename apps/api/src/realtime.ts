import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import {
  activityIdentity,
  GatewayOpcode,
  isGatewayPayload,
  type Activity,
  type GatewayPayload,
  type GatewayResume,
  type PresenceStatus,
  type RealtimeEvent,
} from '@nexplay/shared';
import { config } from './config.js';
import { isBanned } from './moderation.js';
import { PresenceTracker } from './presence.js';
import { listMemberUserIdsForServer, listServerIdsForMember } from './serverMembers.js';
import { getSessionDetailsFromCookieHeader, isSessionCurrent } from './session.js';
import { getUserById } from './users.js';

const REALTIME_PATH = '/api/realtime';
const HEARTBEAT_INTERVAL_MS = 30_000;

interface TrackedSocket extends WebSocket {
  isAlive?: boolean;
  userId?: string;
}

// Quanto tempo uma sessão do gateway espera o cliente voltar (RESUME) depois de cair, e quantos eventos ela guarda
// para reenviar. Passou do tempo, ou perdeu mais eventos que isso, o cliente recebe INVALID_SESSION e recomeça.
export const RESUME_WINDOW_MS = 60_000;
export const RESUME_BUFFER_SIZE = 1_000;
// O cliente dá o HEARTBEAT nesse ritmo (o mesmo intervalo do ping do servidor).
const GATEWAY_HEARTBEAT_INTERVAL_MS = HEARTBEAT_INTERVAL_MS;
// Conexão do gateway que não se identifica nesse tempo é fechada.
const IDENTIFY_TIMEOUT_MS = 20_000;

// Todos os sockets abertos (dos dois formatos), para o ping de vida e para derrubar alguém.
const sockets = new Set<TrackedSocket>();
// Sockets no formato antigo: um RealtimeEvent em JSON por mensagem, sem sequência nem resume.
const legacyClients = new Set<TrackedSocket>();

// Uma sessão do gateway sobrevive à queda do socket por RESUME_WINDOW_MS: enquanto isso continua recebendo (e guardando)
// os eventos da pessoa, para reenviar quando ela voltar com RESUME.
class GatewaySession {
  readonly id = randomUUID();
  seq = 0;
  socket: TrackedSocket | null = null;
  private readonly buffer: { s: number; json: string }[] = [];
  private expiry: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly userId: string) {}

  dispatch(t: string, d: unknown): void {
    const s = ++this.seq;
    const json = JSON.stringify({ op: GatewayOpcode.DISPATCH, t, d, s } satisfies GatewayPayload);
    this.buffer.push({ s, json });
    if (this.buffer.length > RESUME_BUFFER_SIZE) this.buffer.shift();
    const socket = this.socket;
    if (socket && socket.readyState === socket.OPEN) socket.send(json);
  }

  // Dá para retomar de `seq` se nada depois dele se perdeu do buffer.
  canResumeFrom(seq: number): boolean {
    if (!Number.isInteger(seq) || seq < 0 || seq > this.seq) return false;
    if (seq === this.seq) return true;
    const oldest = this.buffer[0]?.s;
    return oldest !== undefined && oldest <= seq + 1;
  }

  replayAfter(seq: number): void {
    const socket = this.socket;
    if (!socket) return;
    for (const entry of this.buffer) {
      if (entry.s > seq && socket.readyState === socket.OPEN) socket.send(entry.json);
    }
  }

  attach(socket: TrackedSocket): void {
    if (this.expiry) clearTimeout(this.expiry);
    this.expiry = null;
    this.socket = socket;
  }

  detach(): void {
    this.socket = null;
    this.expiry = setTimeout(() => sessions.delete(this.id), RESUME_WINDOW_MS);
    this.expiry.unref?.();
  }

  end(): void {
    if (this.expiry) clearTimeout(this.expiry);
    sessions.delete(this.id);
  }
}

const sessions = new Map<string, GatewaySession>();

function deliver(event: RealtimeEvent, wants: (userId: string) => boolean): void {
  let legacyPayload: string | null = null;
  for (const client of legacyClients) {
    if (!client.userId || !wants(client.userId) || client.readyState !== client.OPEN) continue;
    legacyPayload ??= JSON.stringify(event);
    client.send(legacyPayload);
  }
  // Sessões caídas também recebem: o evento fica guardado para o RESUME.
  for (const session of sessions.values()) {
    if (wants(session.userId)) session.dispatch(event.type, event);
  }
}

// Só pra eventos genuinamente de instância inteira (hoje: MEMBER_BANNED/
// MEMBER_UNBANNED, já que ban continua global — ver moderation.ts). Todo
// evento ligado a um servidor específico (canais, cargos, membros,
// mensagens, soundboard) deve usar sendToServerMembers, não isto.
export function broadcast(event: RealtimeEvent): void {
  deliver(event, () => true);
}

// Manda um evento só pros membros de um servidor específico — resolve a
// lista na hora via consulta direta a server_members (sem cache/rooms,
// mesmo pragmatismo de sendToUsers), então nunca fica desatualizada mesmo
// que a filiação mude com frequência.
export function sendToServerMembers(serverId: string, event: RealtimeEvent): void {
  const memberIds = new Set(listMemberUserIdsForServer(serverId));
  deliver(event, (userId) => memberIds.has(userId));
}

// Manda um evento só pros usuários listados (ex.: os 2 participantes de um
// DM) — cobre múltiplas abas/dispositivos do mesmo usuário automaticamente,
// já que cada aba tem o próprio socket (ou sessão) com o userId.
export function sendToUsers(userIds: readonly string[], event: RealtimeEvent): void {
  deliver(event, (userId) => userIds.includes(userId));
}

export function sendToUser(userId: string, event: RealtimeEvent): void {
  sendToUsers([userId], event);
}

// Presença: quem tem o app aberto E quer ser visto. Quem escolheu "invisível" aparece como offline para os outros
// (só a própria pessoa sabe). O aviso de mudança vai só pra quem divide ao menos um servidor com ela (incluindo ela
// mesma, o que é inofensivo).
export function visiblePresenceStatus(userId: string): PresenceStatus | null {
  if (!presence.isOnline(userId)) return null;
  const status = getUserById(userId)?.presenceStatus ?? 'online';
  return status === 'invisible' ? null : status;
}

// O que cada pessoa está fazendo agora (jogo ou música), já na versão pública. Só existe em memória: quem fecha o app
// perde a atividade, e o app dela a reenvia ao reconectar (ver PUT /api/me/activity).
const activities = new Map<string, Activity>();

// A atividade que os outros podem ver: só de quem está online e visível (invisível não entrega nem o que está ouvindo).
export function visibleActivity(userId: string): Activity | null {
  return visiblePresenceStatus(userId) ? (activities.get(userId) ?? null) : null;
}

function audienceOf(userId: string): string[] {
  const audience = new Set<string>();
  for (const serverId of listServerIdsForMember(userId)) {
    for (const memberId of listMemberUserIdsForServer(serverId)) audience.add(memberId);
  }
  return [...audience];
}

function notifyPresence(userId: string): void {
  const status = visiblePresenceStatus(userId);
  const activity = visibleActivity(userId);
  sendToUsers(audienceOf(userId), {
    type: 'PRESENCE_UPDATE',
    userId,
    online: status !== null,
    ...(status ? { status } : {}),
    ...(activity ? { activity } : {}),
  });
}

// A pessoa começou, trocou ou parou de jogar / ouvir. Só avisa quem a vê se a atividade de fato mudou e se ela está visível.
export function setActivity(userId: string, activity: Activity | null): void {
  const before = activities.get(userId) ?? null;
  if (activityIdentity(before) === activityIdentity(activity)) return;
  if (activity) activities.set(userId, activity);
  else activities.delete(userId);
  if (!visiblePresenceStatus(userId)) return;
  sendToUsers(audienceOf(userId), { type: 'ACTIVITY_UPDATE', userId, activity });
}

export const presence = new PresenceTracker((userId, online) => {
  // Saiu de verdade (passou a carência): a atividade some junto, para não reaparecer velha quando ela voltar.
  if (!online) activities.delete(userId);
  notifyPresence(userId);
});

// A pessoa trocou o que mostra (online, ausente, não perturbe, invisível): avisa quem a vê, sem mexer nas conexões.
export function refreshPresence(userId: string): void {
  notifyPresence(userId);
}

// Usado quando um usuário é banido — sem isso, o cookie continuaria válido
// até a próxima requisição HTTP dele; fechar a conexão de tempo real força o
// cliente a notar imediatamente (o cliente web trata o close reconectando e
// então recebe 401/403 do requireSession, que já limpa o cookie).
export function disconnectUser(userId: string): void {
  // A sessão do gateway some junto: sem isso a pessoa poderia retomar (RESUME) e voltar a receber eventos.
  for (const session of [...sessions.values()]) {
    if (session.userId === userId) session.end();
  }
  for (const client of sockets) {
    if (client.userId === userId) client.close();
  }
}

function sendPayload(ws: TrackedSocket, payload: GatewayPayload): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

// Conexão no formato do gateway: HELLO, depois IDENTIFY (sessão nova) ou RESUME (retoma uma que caiu).
function runGateway(ws: TrackedSocket, userId: string): void {
  let session: GatewaySession | null = null;
  sendPayload(ws, { op: GatewayOpcode.HELLO, d: { heartbeatInterval: GATEWAY_HEARTBEAT_INTERVAL_MS } });
  const identifyTimer = setTimeout(() => {
    if (!session) ws.close(4003, 'Não identificado');
  }, IDENTIFY_TIMEOUT_MS);
  identifyTimer.unref?.();

  const start = (next: GatewaySession) => {
    clearTimeout(identifyTimer);
    // Uma aba que retoma a sessão que outro socket ainda segura (queda que o servidor não notou) fica com ela.
    const previous = next.socket;
    next.attach(ws);
    if (previous && previous !== ws) previous.close(4000, 'Sessão retomada em outra conexão');
    session = next;
  };

  ws.on('message', (raw: RawData) => {
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!isGatewayPayload(payload)) return;
    switch (payload.op) {
      case GatewayOpcode.HEARTBEAT:
        sendPayload(ws, { op: GatewayOpcode.HEARTBEAT_ACK });
        return;
      case GatewayOpcode.IDENTIFY: {
        if (session) return;
        const created = new GatewaySession(userId);
        sessions.set(created.id, created);
        start(created);
        // READY é sempre o primeiro evento da sessão; a presença (que avisa a própria pessoa também) vem depois.
        created.dispatch('READY', { sessionId: created.id, userId });
        presence.connect(userId);
        return;
      }
      case GatewayOpcode.RESUME: {
        if (session) return;
        const resume = payload.d as Partial<GatewayResume> | undefined;
        const existing = typeof resume?.sessionId === 'string' ? sessions.get(resume.sessionId) : undefined;
        const seq = Number(resume?.seq);
        if (!existing || existing.userId !== userId || !existing.canResumeFrom(seq)) {
          sendPayload(ws, { op: GatewayOpcode.INVALID_SESSION, d: false });
          return;
        }
        start(existing);
        // Primeiro o que se perdeu, na ordem; depois RESUMED; só então eventos novos (como a própria presença).
        existing.replayAfter(seq);
        existing.dispatch('RESUMED', {});
        presence.connect(userId);
        return;
      }
      default:
        return;
    }
  });

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(identifyTimer);
    sockets.delete(ws);
    if (!session) return;
    // Só larga a sessão se ela ainda é deste socket (pode ter sido retomada por outro).
    if (session.socket === ws) session.detach();
    presence.disconnect(userId);
  };
  ws.on('close', release);
  ws.on('error', release);
}

function runLegacy(ws: TrackedSocket, userId: string): void {
  legacyClients.add(ws);
  presence.connect(userId);
  // 'error' e 'close' podem os dois disparar no mesmo socket; a conexão só pode
  // ser descontada da presença uma vez.
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    sockets.delete(ws);
    legacyClients.delete(ws);
    presence.disconnect(userId);
  };
  ws.on('close', release);
  ws.on('error', release);
}

export function attachRealtime(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  const heartbeat = setInterval(() => {
    for (const client of sockets) {
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  wss.on('close', () => clearInterval(heartbeat));

  server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = new URL(request.url ?? '', 'http://localhost');
    if (url.pathname !== REALTIME_PATH) return;
    // ?v=2 pede o gateway; com ele desligado no servidor, todo mundo fica no formato antigo.
    const gateway = config.REALTIME_GATEWAY && url.searchParams.get('v') === '2';

    // Mesma política de origem já aplicada ao HTTP via cors({ origin: WEB_ORIGIN }).
    const origin = request.headers.origin;
    if (origin && origin !== config.WEB_ORIGIN) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    const identity = getSessionDetailsFromCookieHeader(request.headers.cookie);
    const user = identity ? getUserById(identity.id) : undefined;
    if (!identity || !user || isBanned(user.id) || !isSessionCurrent(identity, user.passwordHash)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws: TrackedSocket) => {
      ws.isAlive = true;
      ws.userId = user.id;
      ws.on('pong', () => {
        ws.isAlive = true;
      });
      sockets.add(ws);
      if (gateway) runGateway(ws, user.id);
      else runLegacy(ws, user.id);
    });
  });
}
