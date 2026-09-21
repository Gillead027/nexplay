import assert from 'node:assert/strict';
import test from 'node:test';
import { RECONNECT_GRACE_MS, connectivityMessage, resolveConnectivity } from './connectivity';

test('com o socket aberto está tudo online', () => {
  assert.equal(resolveConnectivity({ socketConnected: true, browserOnline: true, disconnectedForMs: 0 }), 'online');
});

test('uma queda curta do socket não acende o aviso', () => {
  assert.equal(resolveConnectivity({ socketConnected: false, browserOnline: true, disconnectedForMs: RECONNECT_GRACE_MS - 1 }), 'online');
});

test('socket fechado além da carência vira "reconectando"', () => {
  assert.equal(resolveConnectivity({ socketConnected: false, browserOnline: true, disconnectedForMs: RECONNECT_GRACE_MS }), 'reconnecting');
});

test('sem internet no navegador é "offline", mesmo com o socket aparentemente aberto', () => {
  assert.equal(resolveConnectivity({ socketConnected: true, browserOnline: false, disconnectedForMs: 0 }), 'offline');
  assert.equal(resolveConnectivity({ socketConnected: false, browserOnline: false, disconnectedForMs: 60_000 }), 'offline');
});

test('só há mensagem quando não está online', () => {
  assert.equal(connectivityMessage('online'), null);
  assert.match(connectivityMessage('offline') ?? '', /Sem conexão com a internet/);
  assert.match(connectivityMessage('reconnecting') ?? '', /Reconectando/);
});
