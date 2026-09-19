import assert from 'node:assert/strict';
import test from 'node:test';
import { MIC_MUTED_ATTRIBUTE } from '@nexplay/shared';
import { isMicShownMuted, liveMutedByIdentity } from './micState';

test('ao abrir o app e fora de uma chamada o microfone não aparece mutado', () => {
  assert.equal(isMicShownMuted({ connected: false, deafened: false, userMuted: false }), false);
  assert.equal(isMicShownMuted({ connected: false, deafened: true, userMuted: true }), false);
});

test('numa chamada, só aparece mutado se a pessoa mutou ou ensurdeceu', () => {
  assert.equal(isMicShownMuted({ connected: true, deafened: false, userMuted: false }), false);
  assert.equal(isMicShownMuted({ connected: true, deafened: false, userMuted: true }), true);
  assert.equal(isMicShownMuted({ connected: true, deafened: true, userMuted: false }), true);
});

test('você usa o estado local, sem depender do track de microfone', () => {
  const muted = liveMutedByIdentity(
    [{ identity: 'eu', isLocal: true, isMicrophoneEnabled: false }],
    false,
  );
  assert.equal(muted.get('eu'), false);
  assert.equal(liveMutedByIdentity([{ identity: 'eu', isLocal: true, isMicrophoneEnabled: true }], true).get('eu'), true);
});

test('os outros usam o mute que eles publicaram, mesmo com o track desligado por push-to-talk', () => {
  const muted = liveMutedByIdentity(
    [
      { identity: 'ptt', isLocal: false, isMicrophoneEnabled: false, attributes: { [MIC_MUTED_ATTRIBUTE]: '0' } },
      { identity: 'mudo', isLocal: false, isMicrophoneEnabled: true, attributes: { [MIC_MUTED_ATTRIBUTE]: '1' } },
    ],
    false,
  );
  assert.equal(muted.get('ptt'), false);
  assert.equal(muted.get('mudo'), true);
});

test('sem mute publicado, cai no estado do track de microfone', () => {
  const muted = liveMutedByIdentity(
    [
      { identity: 'ligado', isLocal: false, isMicrophoneEnabled: true },
      { identity: 'desligado', isLocal: false, isMicrophoneEnabled: false, attributes: {} },
      { identity: 'invalido', isLocal: false, isMicrophoneEnabled: true, attributes: { [MIC_MUTED_ATTRIBUTE]: 'talvez' } },
    ],
    false,
  );
  assert.equal(muted.get('ligado'), false);
  assert.equal(muted.get('desligado'), true);
  assert.equal(muted.get('invalido'), false);
});
