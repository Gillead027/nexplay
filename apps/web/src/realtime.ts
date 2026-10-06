import { GATEWAY_VERSION, GatewayOpcode, isGatewayPayload, type GatewayHello, type GatewayPayload, type GatewayReady, type RealtimeEvent } from '@nexplay/shared';
import { reportSessionExpired } from './sessionExpiry';

type EventHandler = (event: RealtimeEvent) => void;
type ConnectHandler = () => void;

const eventHandlers = new Set<EventHandler>();
const connectHandlers = new Set<ConnectHandler>();
const resumeHandlers = new Set<ConnectHandler>();

// Gateway no formato do Discord (ver gateway.ts em @nexplay/shared). A sessão e o último número de sequência
// sobrevivem à queda do socket: na volta o app pede RESUME e o servidor reenvia só o que se perdeu.
let sessionId: string | null = null;
let lastSeq = 0;
// Se o servidor não mandar HELLO logo depois de abrir, ele fala o formato antigo (gateway desligado ou versão velha).
const LEGACY_FALLBACK_MS = 2_000;
const statusHandlers = new Set<(connected: boolean) => void>();
// Estado atual do socket, pra a tela poder avisar quando a conexão com o servidor cai.
let connected = false;

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 15_000;

let socket: WebSocket | null = null;
let reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;
// Cada open() pertence a uma "geração". disconnectRealtime() avança a geração,
// e qualquer callback de uma conexão antiga (onclose, ou a checagem de sessão
// que ainda estava no ar) vê que ficou pra trás e não agenda mais nada.
let generation = 0;

function setConnected(next: boolean): void {
  if (connected === next) return;
  connected = next;
  for (const handler of statusHandlers) handler(next);
}

function realtimeUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}/api/realtime?v=${GATEWAY_VERSION}`;
}

function scheduleReconnect(): void {
  if (reconnectTimer !== null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    open();
  }, reconnectDelayMs);
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
}

// O navegador não expõe o motivo de um handshake recusado: um 401 do servidor
// chega aqui como um fechamento genérico (código 1006), idêntico a uma queda de
// rede. Por isso, quando uma tentativa nem chegou a abrir, pergunta-se à API se
// a sessão ainda vale. Só um 401 explícito conta como "sessão expirada" — falha
// de rede (a checagem também rejeita) segue no ciclo normal de reconexão.
async function sessionIsRejected(): Promise<boolean> {
  try {
    const response = await fetch('/api/session', { credentials: 'include' });
    return response.status === 401;
  } catch {
    return false;
  }
}

function open(): void {
  const attempt = generation;
  const ws = new WebSocket(realtimeUrl());
  socket = ws;
  let opened = false;
  // 'pending' até saber o formato: 'gateway' depois do HELLO, 'legacy' se o servidor falar o antigo.
  let mode: 'pending' | 'gateway' | 'legacy' = 'pending';
  let ready = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatAcked = true;

  const send = (payload: GatewayPayload) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  };
  const stopTimers = () => {
    if (fallbackTimer !== null) clearTimeout(fallbackTimer);
    if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
    fallbackTimer = null;
    heartbeatTimer = null;
  };
  // Conexão nova (READY ou formato antigo): todo mundo refaz o fetch inicial. Retomada (RESUMED): os eventos
  // perdidos já foram reenviados, então só avisa quem precisa reenviar estado próprio ao servidor.
  const markReady = (kind: 'connect' | 'resume') => {
    if (ready) return;
    ready = true;
    setConnected(true);
    for (const handler of kind === 'connect' ? connectHandlers : resumeHandlers) handler();
  };
  const emit = (event: RealtimeEvent) => {
    for (const handler of eventHandlers) handler(event);
  };
  const enterLegacy = () => {
    if (mode !== 'pending') return;
    mode = 'legacy';
    stopTimers();
    markReady('connect');
  };
  const heartbeat = () => {
    // Sem resposta ao último heartbeat a conexão está "zumbi": fecha para reconectar e retomar.
    if (!heartbeatAcked) {
      ws.close();
      return;
    }
    heartbeatAcked = false;
    send({ op: GatewayOpcode.HEARTBEAT, d: lastSeq });
  };

  const handleGateway = (payload: GatewayPayload) => {
    switch (payload.op) {
      case GatewayOpcode.HELLO: {
        if (fallbackTimer !== null) clearTimeout(fallbackTimer);
        fallbackTimer = null;
        mode = 'gateway';
        const interval = Number((payload.d as GatewayHello | undefined)?.heartbeatInterval) || 30_000;
        heartbeatTimer = setInterval(heartbeat, interval);
        if (sessionId) send({ op: GatewayOpcode.RESUME, d: { sessionId, seq: lastSeq } });
        else send({ op: GatewayOpcode.IDENTIFY, d: {} });
        return;
      }
      case GatewayOpcode.HEARTBEAT_ACK:
        heartbeatAcked = true;
        return;
      case GatewayOpcode.HEARTBEAT:
        send({ op: GatewayOpcode.HEARTBEAT, d: lastSeq });
        return;
      case GatewayOpcode.INVALID_SESSION:
        // Não deu para retomar: começa uma sessão nova (e a tela refaz tudo no READY).
        sessionId = null;
        lastSeq = 0;
        send({ op: GatewayOpcode.IDENTIFY, d: {} });
        return;
      case GatewayOpcode.RECONNECT:
        ws.close();
        return;
      case GatewayOpcode.DISPATCH: {
        if (typeof payload.s === 'number') lastSeq = payload.s;
        if (payload.t === 'READY') {
          sessionId = (payload.d as GatewayReady).sessionId;
          markReady('connect');
        } else if (payload.t === 'RESUMED') {
          markReady('resume');
        } else {
          emit(payload.d as RealtimeEvent);
        }
        return;
      }
      default:
        return;
    }
  };

  ws.onopen = () => {
    opened = true;
    reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
    fallbackTimer = setTimeout(enterLegacy, LEGACY_FALLBACK_MS);
  };
  ws.onmessage = (message) => {
    let data: unknown;
    try {
      data = JSON.parse(message.data as string);
    } catch {
      // Mensagem malformada não deve derrubar a conexão inteira.
      return;
    }
    if (mode !== 'legacy' && isGatewayPayload(data)) {
      handleGateway(data);
      return;
    }
    // Formato antigo: o servidor manda o RealtimeEvent direto.
    enterLegacy();
    emit(data as RealtimeEvent);
  };
  ws.onclose = () => {
    stopTimers();
    if (socket === ws) socket = null;
    if (attempt !== generation) return;
    setConnected(false);
    if (opened) {
      scheduleReconnect();
      return;
    }
    void sessionIsRejected().then((rejected) => {
      if (attempt !== generation) return;
      if (rejected) {
        disconnectRealtime();
        reportSessionExpired();
      } else {
        scheduleReconnect();
      }
    });
  };
  ws.onerror = () => ws.close();
}

// Chamado uma vez, dentro de Workspace.tsx (a única tela de vida longa
// pós-login) — idempotente, chamadas repetidas não abrem conexões extras.
export function connectRealtime(): void {
  if (started) return;
  started = true;
  open();
}

// Encerra a conexão e o ciclo de reconexão. Necessário ao sair da conta: o
// servidor só apaga o cookie e não fecha o socket, então sem isso a conexão
// continuaria aberta como o usuário anterior — e uma nova entrada na mesma aba
// (com connectRealtime() já marcado como iniciado) nunca abriria uma própria.
export function disconnectRealtime(): void {
  generation += 1;
  started = false;
  // Sair da conta encerra a sessão do gateway de vez: a próxima entrada começa do zero.
  sessionId = null;
  lastSeq = 0;
  setConnected(false);
  reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const ws = socket;
  socket = null;
  if (ws) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    ws.close();
  }
}

// Cada consumidor assina o fluxo inteiro e filtra pelo próprio `event.type`/
// `channelId` de interesse — mais simples que um registro por tipo de
// evento, e só existem dois consumidores hoje (TextChannels, Workspace).
export function onRealtimeEvent(handler: EventHandler): () => void {
  eventHandlers.add(handler);
  return () => eventHandlers.delete(handler);
}

export function isRealtimeConnected(): boolean {
  return connected;
}

// Avisa quando o socket abre ou fecha (true = conectado).
export function onRealtimeStatus(handler: (connected: boolean) => void): () => void {
  statusHandlers.add(handler);
  return () => statusHandlers.delete(handler);
}

// "Tentar agora": pula a espera do próximo ciclo de reconexão (e volta ao atraso curto).
export function reconnectRealtimeNow(): void {
  if (!started || socket !== null) return;
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  open();
}

// Disparado sempre que uma conexão nova é estabelecida (a primeira vez e
// toda reconexão) — consumidores usam isso pra refazer o fetch inicial e
// resincronizar qualquer coisa perdida enquanto estavam offline.
export function onRealtimeConnect(handler: ConnectHandler): () => void {
  connectHandlers.add(handler);
  return () => connectHandlers.delete(handler);
}

// Disparado quando o gateway retoma a sessão depois de uma queda (RESUMED): os eventos perdidos já chegaram, então
// a tela não precisa refazer nada. Só serve para quem guarda estado no servidor que some quando a pessoa cai
// (ex.: a atividade de jogo/música, que o servidor esquece passada a carência da presença).
export function onRealtimeResume(handler: ConnectHandler): () => void {
  resumeHandlers.add(handler);
  return () => resumeHandlers.delete(handler);
}
