import assert from 'node:assert/strict';
import test from 'node:test';
import { deepLinkUrl, extractDeepLinkInvite, extractInviteCode, inviteUrl, peekPendingInvite, savePendingInvite, takePendingInvite } from './pendingInvite';

test('extrai o código de um link de convite', () => {
  assert.equal(extractInviteCode('/convite/6U8JDJU3'), '6U8JDJU3');
  assert.equal(extractInviteCode('/convite/6U8JDJU3/'), '6U8JDJU3');
  assert.equal(extractInviteCode('/convite/ab-cd_12'), 'ab-cd_12');
});

test('ignora caminhos que não são convite', () => {
  assert.equal(extractInviteCode('/'), null);
  assert.equal(extractInviteCode('/convite/'), null);
  assert.equal(extractInviteCode('/convite/abc'), null);
  assert.equal(extractInviteCode('/convite/6U8JDJU3/extra'), null);
  assert.equal(extractInviteCode('/api/convite/6U8JDJU3'), null);
  assert.equal(extractInviteCode('/convite/<script>'), null);
});

test('monta o link a partir do endereço do site', () => {
  assert.equal(inviteUrl('https://exemplo.io', '6U8JDJU3'), 'https://exemplo.io/convite/6U8JDJU3');
  assert.equal(inviteUrl('https://exemplo.io/', 'a b'), 'https://exemplo.io/convite/a%20b');
});

test('sem sessionStorage nada quebra', () => {
  // No Node não existe sessionStorage: guardar não lança e ler devolve nulo.
  assert.doesNotThrow(() => savePendingInvite('X'));
  assert.equal(peekPendingInvite(), null);
  assert.equal(takePendingInvite(), null);
});

test('guarda, espia e consome o convite pendente uma vez só', () => {
  const store = new Map<string, string>();
  (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  } as unknown as Storage;
  try {
    savePendingInvite('6U8JDJU3');
    assert.equal(peekPendingInvite(), '6U8JDJU3');
    assert.equal(takePendingInvite(), '6U8JDJU3');
    assert.equal(takePendingInvite(), null);
  } finally {
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
  }
});

test('extrai o código de um link nexplay://convite/ entregue pelo app desktop', () => {
  assert.equal(extractDeepLinkInvite('nexplay://convite/6U8JDJU3'), '6U8JDJU3');
  assert.equal(extractDeepLinkInvite('nexplay://convite/6U8JDJU3/'), '6U8JDJU3');
  assert.equal(extractDeepLinkInvite('nexplay://canal/6U8JDJU3'), null);
  assert.equal(extractDeepLinkInvite('https://exemplo.io/convite/6U8JDJU3'), null);
  assert.equal(extractDeepLinkInvite('nexplay://convite/abc'), null);
});

test('monta o link que abre o app instalado', () => {
  assert.equal(deepLinkUrl('6U8JDJU3'), 'nexplay://convite/6U8JDJU3');
});
