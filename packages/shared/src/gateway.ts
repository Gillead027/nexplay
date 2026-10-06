// Protocolo de tempo real no formato do gateway do Discord (Fase 2 do DISCORD_REWRITE_BLUEPRINT.md).
//
// Toda mensagem é um envelope { op, d, s, t }:
//   - o servidor abre com HELLO (d.heartbeatInterval);
//   - o cliente responde IDENTIFY (conexão nova) ou RESUME (d.sessionId + d.seq, depois de uma queda);
//   - o servidor confirma com DISPATCH t='READY' (d.sessionId) ou DISPATCH t='RESUMED', depois de reenviar
//     tudo o que a pessoa perdeu;
//   - os eventos chegam como DISPATCH: t = tipo do evento, d = o RealtimeEvent, s = número de sequência;
//   - o cliente manda HEARTBEAT (d = último s) a cada intervalo e o servidor responde HEARTBEAT_ACK;
//   - INVALID_SESSION: não dá para retomar (sessão vencida ou eventos perdidos demais) — o cliente faz IDENTIFY;
//   - RECONNECT: o servidor pede para o cliente reconectar e retomar.
//
// A autenticação continua pelo cookie de sessão no handshake do WebSocket. O cliente pede este protocolo com
// ?v=2 na URL; sem isso (ou com o gateway desligado no servidor) vale o formato antigo, um RealtimeEvent por mensagem.

export const GATEWAY_VERSION = 2;

export const GatewayOpcode = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;
export type GatewayOpcode = (typeof GatewayOpcode)[keyof typeof GatewayOpcode];

export interface GatewayPayload {
  op: GatewayOpcode;
  d?: unknown;
  s?: number | null;
  t?: string | null;
}

export interface GatewayHello {
  heartbeatInterval: number;
}

export interface GatewayResume {
  sessionId: string;
  seq: number;
}

export interface GatewayReady {
  sessionId: string;
  userId: string;
}

export function isGatewayPayload(value: unknown): value is GatewayPayload {
  return typeof value === 'object' && value !== null && typeof (value as { op?: unknown }).op === 'number';
}
