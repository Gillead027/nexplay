import assert from 'node:assert/strict';
import { test } from 'node:test';

// perfMode.ts lê/grava localStorage e mexe em document.documentElement no módulo top-level de alguns testes antigos
// (bootPerfMode/applyPerfMode) — um DOM mínimo de mentira basta pra exercitar a lógica pura de getPerfMode/setPerfMode.
const store: Record<string, string> = {};
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
};
const attributes: Record<string, string> = {};
(globalThis as unknown as { document: unknown }).document = {
  documentElement: { setAttribute: (name: string, value: string) => { attributes[name] = value; } },
};

const { applyPerfMode, bootPerfMode, getPerfMode, setPerfMode, PERF_MODES } = await import('./perfMode');

test('sem nada guardado, o padrão é "leve" (tudo ligado)', () => {
  assert.equal(getPerfMode(), 'leve');
});

test('escolher um nível guarda e devolve exatamente esse nível', () => {
  for (const mode of PERF_MODES) {
    setPerfMode(mode);
    assert.equal(getPerfMode(), mode);
    assert.equal(attributes['data-perf'], mode);
  }
});

test('os nomes antigos (dois níveis) migram sozinhos: "full" vira "leve", "lite" vira "completo"', () => {
  store['np:perf-mode'] = 'full';
  assert.equal(getPerfMode(), 'leve');
  store['np:perf-mode'] = 'lite';
  assert.equal(getPerfMode(), 'completo');
});

test('valor estragado no armazenamento cai no padrão "leve"', () => {
  store['np:perf-mode'] = 'ultra-turbo';
  assert.equal(getPerfMode(), 'leve');
});

test('applyPerfMode e bootPerfMode escrevem o atributo data-perf na raiz do documento', () => {
  applyPerfMode('moderado');
  assert.equal(attributes['data-perf'], 'moderado');
  store['np:perf-mode'] = 'completo';
  bootPerfMode();
  assert.equal(attributes['data-perf'], 'completo');
});
