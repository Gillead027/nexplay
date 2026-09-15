/// <reference types="node" />

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authorizeVoiceDisconnect } from './voiceModeration.js';

const channels = [
  { id: 'geral', serverId: 'server-1', name: 'Geral', description: 'Canal geral', createdBy: null, createdAt: 0 },
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
});
