import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import type { PresenceStatus, RealtimeEvent } from '@nexplay/shared';
import { config } from './config.js';
import { isBanned } from './moderation.js';
import { PresenceTracker } from './presence.js';
import { listMemberUserIdsForServer, listServerIdsForMember } from './serverMembers.js';
import { getSessionFromCookieHeader } from './session.js';
import { getUserById } from './users.js';

const REALTIME_PATH = '/api/realtime';
const HEARTBEAT_INTERVAL_MS = 30_000;

interface TrackedSocket extends WebSocket {
  isAlive?: boolean;
  userId?: string;
}

// Cada socket já carrega `userId` desde o handshake, então um Set simples
// com filtro linear resolve tanto envio por usuário quanto por servidor sem
// precisar de um Map indexado ou de "salas" — escala de um grupo de amigos.
const clients = new Set<TrackedSocket>();

// Só pra eventos genuinamente de instância inteira (hoje: MEMBER_BANNED/
// MEMBER_UNBANNED, já que ban continua global — ver moderation.ts). Todo
// evento ligado a um servidor específico (canais, cargos, membros,
// mensagens, soundboard) deve usar sendToServerMembers, não isto.
export function broadcast(event: RealtimeEvent): void {
  const payload = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

// Manda um evento só pros membros de um servidor específico — resolve a
// lista na hora via consulta direta a server_members (sem cache/rooms,
// mesmo pragmatismo de sendToUsers), então nunca fica desatualizada mesmo
// que a filiação mude com frequência.
export function sendToServerMembers(serverId: string, event: RealtimeEvent): void {
  const memberIds = new Set(listMemberUserIdsForServer(serverId));
  const payload = JSON.stringify(event);
  for (const client of clients) {
    if (client.userId && memberIds.has(client.userId) && client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

// Manda um evento só pros usuários listados (ex.: os 2 participantes de um
// DM) — cobre múltiplas abas/dispositivos do mesmo usuário automaticamente,
// já que itera todos os sockets e filtra por userId, igual disconnectUser.
export function sendToUsers(userIds: readonly string[], event: RealtimeEvent): void {
  const payload = JSON.stringify(event);
  for (const client of clients) {
    if (client.userId && userIds.includes(client.userId) && client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
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

function notifyPresence(userId: string): void {
  const audience = new Set<string>();
  for (const serverId of listServerIdsForMember(userId)) {
    for (const memberId of listMemberUserIdsForServer(serverId)) audience.add(memberId);
  }
  const status = visiblePresenceStatus(userId);
  sendToUsers([...audience], { type: 'PRESENCE_UPDATE', userId, online: status !== null, ...(status ? { status } : {}) });
}

export const presence = new PresenceTracker((userId) => notifyPresence(userId));

// A pessoa trocou o que mostra (online, ausente, não perturbe, invisível): avisa quem a vê, sem mexer nas conexões.
export function refreshPresence(userId: string): void {
  notifyPresence(userId);
}

// Usado quando um usuário é banido — sem isso, o cookie continuaria válido
// até a próxima requisição HTTP dele; fechar a conexão de tempo real força o
// cliente a notar imediatamente (o cliente web trata o close reconectando e
// então recebe 401/403 do requireSession, que já limpa o cookie).
export function disconnectUser(userId: string): void {
  for (const client of clients) {
    if (client.userId === userId) client.close();
  }
}

export function attachRealtime(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  const heartbeat = setInterval(() => {
    for (const client of clients) {
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
    if (request.url !== REALTIME_PATH) return;

    // Mesma política de origem já aplicada ao HTTP via cors({ origin: WEB_ORIGIN }).
    const origin = request.headers.origin;
    if (origin && origin !== config.WEB_ORIGIN) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    const identity = getSessionFromCookieHeader(request.headers.cookie);
    const user = identity ? getUserById(identity.id) : undefined;
    if (!user || isBanned(user.id)) {
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
      clients.add(ws);
      presence.connect(user.id);
      // 'error' e 'close' podem os dois disparar no mesmo socket; a conexão só pode
      // ser descontada da presença uma vez.
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        clients.delete(ws);
        presence.disconnect(user.id);
      };
      ws.on('close', release);
      ws.on('error', release);
    });
  });
}
