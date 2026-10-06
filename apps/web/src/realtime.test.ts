/// <reference types="node" />

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { connectRealtime, disconnectRealtime, onRealtimeConnect, onRealtimeEvent, onRealtimeResume } from './realtime.js';
import { onSessionExpired } from './sessionExpiry.js';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;

  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  readyState = 0;
  sent: Record<string, unknown>[] = [];

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  receive(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }

  // O navegador dispara "error" e depois "close" quando o handshake é recusado.
  rejectHandshake(): void {
    this.onerror?.();
    this.close();
  }

  accept(): void {
    this.readyState = 1;
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
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
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

describe('cliente de tempo real: gateway (opcodes, sequência e resume)', () => {
  const HELLO = { op: 10, d: { heartbeatInterval: 30_000 } };

  function counters() {
    const seen = { connects: 0, resumes: 0, events: [] as string[] };
    const offs = [
      onRealtimeConnect(() => { seen.connects += 1; }),
      onRealtimeResume(() => { seen.resumes += 1; }),
      onRealtimeEvent((event) => { seen.events.push(event.type); }),
    ];
    return { seen, off: () => offs.forEach((off) => off()) };
  }

  it('pede o gateway na URL, identifica depois do HELLO e só avisa "conectado" no READY', () => {
    const { seen, off } = counters();
    connectRealtime();
    const ws = socketAt(0);
    assert.match(ws.url, /\/api\/realtime\?v=2$/);
    ws.accept();
    ws.receive(HELLO);
    assert.deepEqual(ws.sent.at(-1), { op: 2, d: {} });
    assert.equal(seen.connects, 0);

    ws.receive({ op: 0, t: 'READY', s: 1, d: { sessionId: 'sessao-1', userId: 'u1' } });
    assert.equal(seen.connects, 1);
    ws.receive({ op: 0, t: 'TYPING_START', s: 2, d: { type: 'TYPING_START' } });
    assert.deepEqual(seen.events, ['TYPING_START']);
    off();
  });

  it('depois de uma queda retoma a sessão de onde parou, sem refazer a tela', () => {
    const { seen, off } = counters();
    connectRealtime();
    const first = socketAt(0);
    first.accept();
    first.receive(HELLO);
    first.receive({ op: 0, t: 'READY', s: 1, d: { sessionId: 'sessao-1', userId: 'u1' } });
    first.receive({ op: 0, t: 'X', s: 2, d: { type: 'X' } });
    first.close();

    mock.timers.tick(1_000);
    const second = socketAt(1);
    second.accept();
    second.receive(HELLO);
    assert.deepEqual(second.sent.at(-1), { op: 6, d: { sessionId: 'sessao-1', seq: 2 } });

    // O servidor reenvia o que se perdeu e confirma.
    second.receive({ op: 0, t: 'Y', s: 3, d: { type: 'Y' } });
    second.receive({ op: 0, t: 'RESUMED', s: 4, d: {} });
    assert.equal(seen.connects, 1);
    assert.equal(seen.resumes, 1);
    assert.deepEqual(seen.events, ['X', 'Y']);
    off();
  });

  it('sessão que não dá para retomar começa do zero (IDENTIFY)', () => {
    connectRealtime();
    const first = socketAt(0);
    first.accept();
    first.receive(HELLO);
    first.receive({ op: 0, t: 'READY', s: 1, d: { sessionId: 'sessao-1', userId: 'u1' } });
    first.close();
    mock.timers.tick(1_000);
    const second = socketAt(1);
    second.accept();
    second.receive(HELLO);
    second.receive({ op: 9, d: false });
    assert.deepEqual(second.sent.at(-1), { op: 2, d: {} });
  });

  it('responde o heartbeat e fecha a conexão "zumbi" que parou de responder', () => {
    connectRealtime();
    const ws = socketAt(0);
    ws.accept();
    ws.receive(HELLO);
    ws.receive({ op: 0, t: 'READY', s: 1, d: { sessionId: 's', userId: 'u1' } });

    mock.timers.tick(30_000);
    assert.deepEqual(ws.sent.at(-1), { op: 1, d: 1 });
    ws.receive({ op: 11 });
    mock.timers.tick(30_000);
    assert.equal(ws.closed, false);
    // Sem ACK desta vez: no próximo intervalo a conexão cai para reconectar.
    mock.timers.tick(30_000);
    assert.equal(ws.closed, true);
  });

  it('servidor no formato antigo: sem HELLO, o app segue como antes', () => {
    const { seen, off } = counters();
    connectRealtime();
    const ws = socketAt(0);
    ws.accept();
    mock.timers.tick(2_000);
    assert.equal(seen.connects, 1);
    ws.receive({ type: 'MEMBER_BANNED', userId: 'u2' });
    assert.deepEqual(seen.events, ['MEMBER_BANNED']);
    off();
  });

  it('evento do formato antigo antes do prazo também ativa o modo antigo', () => {
    const { seen, off } = counters();
    connectRealtime();
    const ws = socketAt(0);
    ws.accept();
    ws.receive({ type: 'PRESENCE_UPDATE', userId: 'u2', online: true });
    assert.equal(seen.connects, 1);
    assert.deepEqual(seen.events, ['PRESENCE_UPDATE']);
    off();
  });
});
