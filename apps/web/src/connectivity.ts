export type ConnectivityState = 'online' | 'offline' | 'reconnecting';

// Recarregar a página ou perder a rede por um instante fecha o socket e reabre logo em
// seguida. Sem carência o aviso piscaria a cada reconexão rápida.
export const RECONNECT_GRACE_MS = 3_000;

export function resolveConnectivity({
  socketConnected,
  browserOnline,
  disconnectedForMs,
}: {
  socketConnected: boolean;
  browserOnline: boolean;
  disconnectedForMs: number;
}): ConnectivityState {
  if (!browserOnline) return 'offline';
  if (socketConnected) return 'online';
  return disconnectedForMs >= RECONNECT_GRACE_MS ? 'reconnecting' : 'online';
}

export function connectivityMessage(state: ConnectivityState): string | null {
  if (state === 'offline') return 'Sem conexão com a internet. O que você enviar só sai quando ela voltar.';
  if (state === 'reconnecting') return 'Sem conexão com o servidor. Reconectando…';
  return null;
}
