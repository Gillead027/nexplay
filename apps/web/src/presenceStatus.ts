import type { PresenceStatus, RealtimeEvent } from '@nexplay/shared';

/** Quem está visível agora (id -> o que mostra), a partir de um evento em tempo real. Mesma referência quando nada muda. */
export function applyPresenceStatusEvent(statuses: ReadonlyMap<string, PresenceStatus>, event: RealtimeEvent): ReadonlyMap<string, PresenceStatus> {
  if (event.type !== 'PRESENCE_UPDATE') return statuses;
  if (!event.online) {
    if (!statuses.has(event.userId)) return statuses;
    const next = new Map(statuses);
    next.delete(event.userId);
    return next;
  }
  const status: PresenceStatus = event.status ?? 'online';
  if (statuses.get(event.userId) === status) return statuses;
  const next = new Map(statuses);
  next.set(event.userId, status);
  return next;
}

/** A leitura inicial do servidor (com "statuses"; servidores mais antigos só mandam a lista de quem está online). */
export function presenceFromResponse(response: { onlineUserIds: string[]; statuses?: Record<string, PresenceStatus> }): ReadonlyMap<string, PresenceStatus> {
  if (response.statuses) return new Map(Object.entries(response.statuses));
  return new Map(response.onlineUserIds.map((id) => [id, 'online' as PresenceStatus]));
}

/** A cor da bolinha de status (classe CSS). "Invisível" é uma bolinha vazada, como o offline. */
export const statusClass = (status: PresenceStatus | 'offline'): string => `status-${status}`;
