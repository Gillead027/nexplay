import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveCallStart } from './callStart.js';

const NOW = 1_000_000;

test('sem ninguém de verdade na sala não há chamada (o bot de música sozinho não conta)', () => {
  assert.deepEqual(resolveCallStart(null, [], NOW), { startedAt: null, persist: false });
  // mesmo com um começo guardado: a chamada terminou
  assert.deepEqual(resolveCallStart(500_000, [], NOW), { startedAt: null, persist: false });
});

test('a primeira pessoa a entrar começa a chamada na hora em que ela entrou', () => {
  assert.deepEqual(resolveCallStart(null, [990_000], NOW), { startedAt: 990_000, persist: true });
});

test('com o começo já guardado ele não muda quando outras pessoas entram ou a primeira sai', () => {
  assert.deepEqual(resolveCallStart(400_000, [900_000, 950_000], NOW), { startedAt: 400_000, persist: false });
});

test('depois de a API reiniciar sem registro, vale a entrada mais antiga de quem está na sala, nunca no futuro', () => {
  assert.deepEqual(resolveCallStart(null, [700_000, 300_000, 900_000], NOW), { startedAt: 300_000, persist: true });
  assert.deepEqual(resolveCallStart(null, [NOW + 60_000], NOW), { startedAt: NOW, persist: true });
  // hora de entrada desconhecida (0) não vira "chamada desde 1970"
  assert.deepEqual(resolveCallStart(null, [0, 800_000], NOW), { startedAt: 800_000, persist: true });
  assert.deepEqual(resolveCallStart(null, [0], NOW), { startedAt: NOW, persist: true });
});
