import { MUSIC_BOT_IDENTITY, type VoiceChannel } from '@nexplay/shared';

export type VoiceMoveAuthorization =
  | { ok: true }
  | { ok: false; reason: 'INVALID_ROOM' | 'SAME_ROOM' | 'TARGET_IS_BOT' | 'TARGET_NOT_IN_ROOM' | 'DESTINATION_FULL' };

// Regras de mover alguém de um canal de voz para outro (a permissão de quem move é conferida na rota).
// Os dois canais precisam ser do servidor, a pessoa precisa estar mesmo no canal de origem, o NexMusic
// não é movido, e o destino não pode estar cheio (limite de pessoas do canal).
export function authorizeVoiceMove({
  fromRoomId,
  toRoomId,
  channels,
  targetIdentity,
  participantIdentities,
  destinationParticipantCount,
}: {
  fromRoomId: string;
  toRoomId: string;
  channels: readonly VoiceChannel[];
  targetIdentity: string;
  participantIdentities: readonly string[];
  destinationParticipantCount: number;
}): VoiceMoveAuthorization {
  const destination = channels.find((channel) => channel.id === toRoomId);
  if (!destination || !channels.some((channel) => channel.id === fromRoomId)) return { ok: false, reason: 'INVALID_ROOM' };
  if (fromRoomId === toRoomId) return { ok: false, reason: 'SAME_ROOM' };
  if (targetIdentity === MUSIC_BOT_IDENTITY) return { ok: false, reason: 'TARGET_IS_BOT' };
  if (!participantIdentities.includes(targetIdentity)) return { ok: false, reason: 'TARGET_NOT_IN_ROOM' };
  if (destination.userLimit > 0 && destinationParticipantCount >= destination.userLimit) return { ok: false, reason: 'DESTINATION_FULL' };
  return { ok: true };
}

export type VoiceDisconnectAuthorization =
  | { ok: true }
  | { ok: false; reason: 'INVALID_ROOM' | 'REQUESTER_NOT_IN_ROOM' | 'TARGET_NOT_IN_ROOM' };

// requireRequesterInRoom: quem tira o NexMusic da chamada precisa estar nela; um moderador (que tem "Expulsar
// membros", conferido na rota) desconecta alguém mesmo sem estar no canal.
export function authorizeVoiceDisconnect({
  roomId,
  channels,
  requesterId,
  targetIdentity,
  participantIdentities,
  requireRequesterInRoom = true,
}: {
  roomId: string;
  channels: readonly VoiceChannel[];
  requesterId: string;
  targetIdentity: string;
  participantIdentities: readonly string[];
  requireRequesterInRoom?: boolean;
}): VoiceDisconnectAuthorization {
  if (!channels.some((channel) => channel.id === roomId)) {
    return { ok: false, reason: 'INVALID_ROOM' };
  }

  const identities = new Set(participantIdentities);
  if (requireRequesterInRoom && !identities.has(requesterId)) {
    return { ok: false, reason: 'REQUESTER_NOT_IN_ROOM' };
  }

  if (!identities.has(targetIdentity)) {
    return { ok: false, reason: 'TARGET_NOT_IN_ROOM' };
  }

  return { ok: true };
}
