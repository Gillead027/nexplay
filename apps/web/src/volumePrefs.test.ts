/// <reference types="node" />

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { loadVolumes, parseVolumes, saveVolumes, serializeVolumes, volumeStorageKey } from './volumePrefs.js';

describe('leitura segura do volume guardado', () => {
  it('lê o que foi guardado', () => {
    assert.deepEqual(parseVolumes('{"ana":40,"bia":0,"cid":75}'), { ana: 40, bia: 0, cid: 75 });
  });

  it('não guarda o volume padrão (100), que é o mesmo que não ter ajustado', () => {
    assert.deepEqual(parseVolumes('{"ana":100,"bia":30}'), { bia: 30 });
  });

  it('arredonda e limita a 0..100', () => {
    assert.deepEqual(parseVolumes('{"a":49.6,"b":-20,"c":250,"d":0.4}'), { a: 50, b: 0, d: 0 });
  });

  it('ignora valores que não são número e chaves inválidas', () => {
    assert.deepEqual(parseVolumes(JSON.stringify({ a: '40', b: null, c: true, d: {}, e: NaN, f: 20, [' '.repeat(0)]: 10, ['x'.repeat(200)]: 10 })), { f: 20 });
  });

  it('devolve vazio para JSON quebrado, array, texto ou nada', () => {
    for (const raw of ['{quebrado', '[1,2,3]', '"texto"', '42', 'null', '', null, undefined]) {
      assert.deepEqual(parseVolumes(raw as string | null | undefined), {}, String(raw));
    }
  });

  it('limita o número de pessoas guardadas', () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < 700; i += 1) many[`u${i}`] = 50;
    assert.equal(Object.keys(parseVolumes(JSON.stringify(many))).length, 500);
  });

  it('não deixa chaves perigosas virarem propriedades especiais', () => {
    const parsed = parseVolumes('{"__proto__":20,"constructor":30,"toString":40}');
    assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  });
});

describe('chave por conta e tipo', () => {
  it('separa voz e transmissão e separa contas', () => {
    assert.notEqual(volumeStorageKey('voice', 'u1'), volumeStorageKey('stream', 'u1'));
    assert.notEqual(volumeStorageKey('voice', 'u1'), volumeStorageKey('voice', 'u2'));
    assert.equal(volumeStorageKey('voice', 'u1'), 'np:voice-volumes:u1');
  });
});

describe('gravar e recarregar (simula fechar e abrir o app)', () => {
  const store = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
      },
    });
  });

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as Record<string, unknown>).localStorage;
  });

  it('o volume de cada pessoa volta exatamente como foi deixado', () => {
    const key = volumeStorageKey('voice', 'eu');
    saveVolumes(key, { ana: 35, bia: 0, cid: 88 });
    assert.deepEqual(loadVolumes(key), { ana: 35, bia: 0, cid: 88 });
  });

  it('voltar uma pessoa a 100 tira ela do armazenamento, e zerar tudo apaga a chave', () => {
    const key = volumeStorageKey('voice', 'eu');
    saveVolumes(key, { ana: 35, bia: 60 });
    saveVolumes(key, { ana: 100, bia: 60 });
    assert.deepEqual(loadVolumes(key), { bia: 60 });
    saveVolumes(key, { bia: 100 });
    assert.equal(store.has(key), false);
  });

  it('contas diferentes não misturam', () => {
    saveVolumes(volumeStorageKey('voice', 'eu'), { ana: 10 });
    saveVolumes(volumeStorageKey('voice', 'outra'), { ana: 90 });
    assert.deepEqual(loadVolumes(volumeStorageKey('voice', 'eu')), { ana: 10 });
    assert.deepEqual(loadVolumes(volumeStorageKey('voice', 'outra')), { ana: 90 });
  });

  it('sem armazenamento disponível, não quebra', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error('bloqueado'); },
    });
    assert.deepEqual(loadVolumes('qualquer'), {});
    assert.doesNotThrow(() => saveVolumes('qualquer', { ana: 10 }));
  });

  it('serializar já normaliza', () => {
    assert.equal(serializeVolumes({ a: 100, b: 12.4, c: 999 }), '{"b":12}');
  });
});
