import type { ForwardDestination } from '@sausixudos/shared';
import { getDmChannelForParticipant } from './dmChannels.js';
import { getTextChannelById } from './textChannels.js';
import { isServerMember } from './serverMembers.js';

export type ResolvedForwardDestination =
  | { ok: true; kind: 'channel'; serverId: string; channelId: string }
  | { ok: true; kind: 'dm'; dmChannelId: string; otherUserId: string }
  | { ok: false; status: number; error: string };

// Único resolvedor de destino, compartilhado pelas duas rotas de encaminhar
// (origem canal e origem DM em index.ts) — evita duplicar a mesma validação
// duas vezes. Só resolve existência + filiação/participação (mesmos 404
// genéricos que toda outra rota de mensagem já usa, nunca 403, pra não
// revelar a terceiro que um servidor/conversa existe). NÃO decide timeout
// nem bloqueio — isso fica com a rota chamadora, que já tem
// rejectIfTimedOut/isBlocked prontos e vive em index.ts.
export function resolveForwardDestination(
  destination: ForwardDestination,
  requesterId: string,
): ResolvedForwardDestination {
  if (destination.kind === 'channel') {
    if (!isServerMember(destination.serverId, requesterId)) {
      return { ok: false, status: 404, error: 'Servidor não encontrado.' };
    }
    const channel = getTextChannelById(destination.channelId);
    if (!channel || channel.serverId !== destination.serverId) {
      return { ok: false, status: 404, error: 'Canal de texto não encontrado.' };
    }
    return { ok: true, kind: 'channel', serverId: destination.serverId, channelId: destination.channelId };
  }

  const channel = getDmChannelForParticipant(destination.dmChannelId, requesterId);
  if (!channel) return { ok: false, status: 404, error: 'Conversa não encontrada.' };
  const other = channel.participants.find((participant) => participant.id !== requesterId)!;
  return { ok: true, kind: 'dm', dmChannelId: destination.dmChannelId, otherUserId: other.id };
}
