import type { RealtimeEvent } from '@nexplay/shared';
import { reportSessionExpired } from './sessionExpiry';

type EventHandler = (event: RealtimeEvent) => void;
type ConnectHandler = () => void;

const eventHandlers = new Set<EventHandler>();
const connectHandlers = new Set<ConnectHandler>();

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

function realtimeUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}/api/realtime`;
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

  ws.onopen = () => {
    opened = true;
    reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
    for (const handler of connectHandlers) handler();
  };
  ws.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data as string) as RealtimeEvent;
      for (const handler of eventHandlers) handler(event);
    } catch {
      // Evento malformado não deve derrubar a conexão inteira.
    }
  };
  ws.onclose = () => {
    if (socket === ws) socket = null;
    if (attempt !== generation) return;
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

// Disparado sempre que uma conexão nova é estabelecida (a primeira vez e
// toda reconexão) — consumidores usam isso pra refazer o fetch inicial e
// resincronizar qualquer coisa perdida enquanto estavam offline.
export function onRealtimeConnect(handler: ConnectHandler): () => void {
  connectHandlers.add(handler);
  return () => connectHandlers.delete(handler);
}
