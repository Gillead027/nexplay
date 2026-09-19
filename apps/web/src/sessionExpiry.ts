type SessionExpiredHandler = () => void;

const handlers = new Set<SessionExpiredHandler>();

// O servidor recusou a sessão atual (cookie expirado, ausente ou inválido).
// Vem de dois lugares que não se conhecem: as chamadas HTTP (api.ts) e a
// reconexão do WebSocket (realtime.ts). Quem decide o que fazer com isso —
// hoje, voltar pra tela de entrada — é o App, que assina aqui.
export function reportSessionExpired(): void {
  for (const handler of handlers) handler();
}

export function onSessionExpired(handler: SessionExpiredHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}
