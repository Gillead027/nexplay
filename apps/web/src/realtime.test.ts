/// <reference types="node" />

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { connectRealtime, disconnectRealtime } from './realtime.js';
import { onSessionExpired } from './sessionExpiry.js';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }

  // O navegador dispara "error" e depois "close" quando o handshake é recusado.
  rejectHandshake(): void {
    this.onerror?.();
    this.close();
  }

  accept(): void {
    this.onopen?.();
  }
}

type SessionCheck = () => Promise<{ status: number }>;

const globals = globalThis as unknown as Record<string, unknown>;
let sessionChecks = 0;
let sessionCheck: SessionCheck;
let expiredReports = 0;
let unsubscribe: () => void;

function socketAt(index: number): FakeWebSocket {
  const instance = FakeWebSocket.instances[index];
  assert.ok(instance, `esperava o socket #${index}, mas só existem ${FakeWebSocket.instances.length}`);
  return instance;
}

// A checagem de sessão é assíncrona (fetch + then); deixa a fila de microtarefas
// esvaziar antes de olhar o resultado.
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  FakeWebSocket.instances = [];
  sessionChecks = 0;
  expiredReports = 0;
  sessionCheck = async () => ({ status: 200 });
  globals.window = { location: { protocol: 'https:', host: 'nexplay.test' } };
  globals.WebSocket = FakeWebSocket;
  globals.fetch = async (path: string) => {
    assert.equal(path, '/api/session');
    sessionChecks += 1;
    return sessionCheck();
  };
  mock.timers.enable({ apis: ['setTimeout'] });
  unsubscribe = onSessionExpired(() => {
    expiredReports += 1;
  });
});

afterEach(() => {
  disconnectRealtime();
  unsubscribe();
  mock.timers.reset();
});

describe('cliente de tempo real: sessão expirada', () => {
  it('para de reconectar e avisa quando o handshake é recusado com 401', async () => {
    sessionCheck = async () => ({ status: 401 });
    connectRealtime();
    assert.equal(FakeWebSocket.instances.length, 1);

    socketAt(0).rejectHandshake();
    await flush();

    assert.equal(sessionChecks, 1);
    assert.equal(expiredReports, 1);

    // O bug original: reconexão infinita a cada 15 s. Nada mais deve abrir.
    mock.timers.tick(60_000);
    await flush();
    assert.equal(FakeWebSocket.instances.length, 1);
    assert.equal(expiredReports, 1);
  });

  it('continua reconectando quando a checagem de sessão falha por rede caída', async () => {
    sessionCheck = async () => {
      throw new TypeError('Failed to fetch');
    };
    connectRealtime();
    socketAt(0).rejectHandshake();
    await flush();

    assert.equal(expiredReports, 0);
    mock.timers.tick(1_000);
    assert.equal(FakeWebSocket.instances.length, 2);
  });

  it('continua reconectando quando a sessão ainda vale (servidor reiniciando)', async () => {
    sessionCheck = async () => ({ status: 200 });
    connectRealtime();
    socketAt(0).rejectHandshake();
    await flush();

    assert.equal(expiredReports, 0);
    mock.timers.tick(1_000);
    assert.equal(FakeWebSocket.instances.length, 2);
  });

  it('não consulta a sessão quando uma conexão que já tinha aberto cai', async () => {
    connectRealtime();
    socketAt(0).accept();
    socketAt(0).close();
    await flush();

    assert.equal(sessionChecks, 0);
    mock.timers.tick(1_000);
    assert.equal(FakeWebSocket.instances.length, 2);
  });

  it('não reporta expiração se o usuário saiu enquanto a checagem estava no ar', async () => {
    sessionCheck = async () => ({ status: 401 });
    connectRealtime();
    socketAt(0).rejectHandshake();
    disconnectRealtime();
    await flush();

    assert.equal(expiredReports, 0);
    mock.timers.tick(60_000);
    assert.equal(FakeWebSocket.instances.length, 1);
  });
});

describe('cliente de tempo real: sair da conta', () => {
  it('fecha o socket aberto e não reconecta sozinho', () => {
    connectRealtime();
    const first = socketAt(0);
    first.accept();

    disconnectRealtime();

    assert.equal(first.closed, true);
    mock.timers.tick(60_000);
    assert.equal(FakeWebSocket.instances.length, 1);
  });

  it('abre uma conexão nova quando outra pessoa entra na mesma aba', () => {
    connectRealtime();
    socketAt(0).accept();
    disconnectRealtime();

    connectRealtime();

    assert.equal(FakeWebSocket.instances.length, 2);
    assert.equal(socketAt(1).closed, false);
  });

  it('continua idempotente: chamar connectRealtime duas vezes abre um socket só', () => {
    connectRealtime();
    connectRealtime();
    assert.equal(FakeWebSocket.instances.length, 1);
  });
});
