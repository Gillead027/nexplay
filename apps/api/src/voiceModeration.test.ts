/// <reference types="node" />

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authorizeVoiceDisconnect, authorizeVoiceMove } from './voiceModeration.js';

const channels = [
  {
    id: 'geral', serverId: 'server-1', categoryId: null, name: 'Geral', description: 'Canal geral',
    slowModeSeconds: 0, contentVisibility: 'default' as const, bitrateKbps: 0, videoQuality: 'auto' as const,
    userLimit: 0, createdBy: null, createdAt: 0,
  },
];

describe('authorizeVoiceDisconnect', () => {
  it('permite que um participante da sala desconecte outro participante', () => {
    assert.deepEqual(authorizeVoiceDisconnect({
      roomId: 'geral',
      channels,
      requesterId: 'alice',
      targetIdentity: 'bob',
      participantIdentities: ['alice', 'bob'],
    }), { ok: true });
  });

  it('rejeita solicitante que não está na mesma sala', () => {
    assert.deepEqual(authorizeVoiceDisconnect({
      roomId: 'geral',
      channels,
      requesterId: 'alice',
      targetIdentity: 'bob',
      participantIdentities: ['bob'],
    }), { ok: false, reason: 'REQUESTER_NOT_IN_ROOM' });
  });

  it('um moderador (que a rota já conferiu) pode desconectar alguém sem estar no canal', () => {
    assert.deepEqual(authorizeVoiceDisconnect({
      roomId: 'geral',
      channels,
      requesterId: 'mod',
      targetIdentity: 'bob',
      participantIdentities: ['bob'],
      requireRequesterInRoom: false,
    }), { ok: true });
  });
});

const moveChannels = [
  { ...channels[0]!, id: 'geral' },
  { ...channels[0]!, id: 'jogos', name: 'Jogos' },
  { ...channels[0]!, id: 'pequeno', name: 'Pequeno', userLimit: 2 },
];

describe('authorizeVoiceMove', () => {
  const base = {
    fromRoomId: 'geral',
    toRoomId: 'jogos',
    channels: moveChannels,
    targetIdentity: 'bob',
    participantIdentities: ['alice', 'bob'],
    destinationParticipantCount: 0,
  };

  it('permite mover quem está no canal de origem para outro canal do servidor', () => {
    assert.deepEqual(authorizeVoiceMove(base), { ok: true });
  });

  it('rejeita canal que não é do servidor (origem ou destino)', () => {
    assert.deepEqual(authorizeVoiceMove({ ...base, toRoomId: 'outro-servidor' }), { ok: false, reason: 'INVALID_ROOM' });
    assert.deepEqual(authorizeVoiceMove({ ...base, fromRoomId: 'outro-servidor' }), { ok: false, reason: 'INVALID_ROOM' });
  });

  it('rejeita mover para o mesmo canal', () => {
    assert.deepEqual(authorizeVoiceMove({ ...base, toRoomId: 'geral' }), { ok: false, reason: 'SAME_ROOM' });
  });

  it('rejeita quem não está mais no canal de origem', () => {
    assert.deepEqual(authorizeVoiceMove({ ...base, targetIdentity: 'carol' }), { ok: false, reason: 'TARGET_NOT_IN_ROOM' });
  });

  it('não move o NexMusic', () => {
    assert.deepEqual(
      authorizeVoiceMove({ ...base, targetIdentity: 'music-bot', participantIdentities: ['alice', 'music-bot'] }),
      { ok: false, reason: 'TARGET_IS_BOT' },
    );
  });

  it('respeita o limite de pessoas do canal de destino', () => {
    assert.deepEqual(authorizeVoiceMove({ ...base, toRoomId: 'pequeno', destinationParticipantCount: 2 }), { ok: false, reason: 'DESTINATION_FULL' });
    assert.deepEqual(authorizeVoiceMove({ ...base, toRoomId: 'pequeno', destinationParticipantCount: 1 }), { ok: true });
  });
});
