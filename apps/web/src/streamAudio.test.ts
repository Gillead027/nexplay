/// <reference types="node" />

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldPlayAudioPublication, watchedStreamIdentities } from './streamAudio.js';

const share = (identity: string, sid: string) => ({ id: `${identity}-${sid}`, participantIdentity: identity, isScreenShare: true });
const camera = (identity: string, sid: string) => ({ id: `${identity}-${sid}`, participantIdentity: identity, isScreenShare: false });

describe('quem o usuário está assistindo', () => {
  it('ninguém, enquanto não clicou em assistir', () => {
    const watched = watchedStreamIdentities([share('ana', 'TR_1'), share('bia', 'TR_2')], new Set());
    assert.equal(watched.size, 0);
  });

  it('só as pessoas cuja transmissão foi aberta', () => {
    const watched = watchedStreamIdentities([share('ana', 'TR_1'), share('bia', 'TR_2')], new Set(['bia-TR_2']));
    assert.deepEqual([...watched], ['bia']);
  });

  it('câmera aberta na galeria não conta como assistir uma transmissão', () => {
    const watched = watchedStreamIdentities([camera('ana', 'TR_9'), share('ana', 'TR_1')], new Set(['ana-TR_9']));
    assert.equal(watched.size, 0);
  });

  it('quando a pessoa recomeça a transmitir o id muda e ela volta a não assistida', () => {
    const watching = new Set(['ana-TR_1']);
    assert.deepEqual([...watchedStreamIdentities([share('ana', 'TR_1')], watching)], ['ana']);
    assert.equal(watchedStreamIdentities([share('ana', 'TR_7')], watching).size, 0);
  });

  it('um id assistido de transmissão que já acabou não liga nada', () => {
    assert.equal(watchedStreamIdentities([], new Set(['ana-TR_1'])).size, 0);
  });
});

describe('qual áudio toca', () => {
  const mic = { isMicrophone: true, isScreenShareAudio: false, isSoundboard: false };
  const stream = { isMicrophone: false, isScreenShareAudio: true, isSoundboard: false };
  const soundboard = { isMicrophone: false, isScreenShareAudio: false, isSoundboard: true };
  const other = { isMicrophone: false, isScreenShareAudio: false, isSoundboard: false };

  it('o áudio da transmissão NÃO toca sem assistir (o vazamento corrigido)', () => {
    assert.equal(shouldPlayAudioPublication(stream, false), false);
  });

  it('o áudio da transmissão toca quando o usuário está assistindo', () => {
    assert.equal(shouldPlayAudioPublication(stream, true), true);
  });

  it('a voz e o soundboard tocam sempre, assistindo ou não', () => {
    for (const watching of [true, false]) {
      assert.equal(shouldPlayAudioPublication(mic, watching), true);
      assert.equal(shouldPlayAudioPublication(soundboard, watching), true);
    }
  });

  it('assistir não liga faixas de outro tipo', () => {
    assert.equal(shouldPlayAudioPublication(other, true), false);
  });
});
