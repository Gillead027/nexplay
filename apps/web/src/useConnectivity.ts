import { useCallback, useEffect, useState } from 'react';
import { RECONNECT_GRACE_MS, resolveConnectivity, type ConnectivityState } from './connectivity';
import { isRealtimeConnected, onRealtimeStatus, reconnectRealtimeNow } from './realtime';

// Estado da conexão com o servidor pra mostrar o aviso de "sem conexão / reconectando".
// Vale pro app inteiro: o socket de tempo real cai junto com qualquer queda de rede.
export function useConnectivity(): { state: ConnectivityState; retryNow: () => void } {
  const [socketConnected, setSocketConnected] = useState(() => isRealtimeConnected());
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine);
  const [disconnectedSince, setDisconnectedSince] = useState<number | null>(() => (isRealtimeConnected() ? null : Date.now()));
  const [, rerender] = useState(0);

  useEffect(
    () =>
      onRealtimeStatus((connected) => {
        setSocketConnected(connected);
        setDisconnectedSince((previous) => (connected ? null : (previous ?? Date.now())));
      }),
    [],
  );

  useEffect(() => {
    const goOnline = () => {
      setBrowserOnline(true);
      // A rede voltou: não espera o próximo ciclo de reconexão.
      reconnectRealtimeNow();
    };
    const goOffline = () => setBrowserOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // O aviso depende de quanto tempo o socket está fora: um novo render ao fim da carência.
  useEffect(() => {
    if (socketConnected) return;
    const timer = window.setTimeout(() => rerender((count) => count + 1), RECONNECT_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [socketConnected, disconnectedSince]);

  const state = resolveConnectivity({
    socketConnected,
    browserOnline,
    disconnectedForMs: disconnectedSince === null ? 0 : Date.now() - disconnectedSince,
  });

  const retryNow = useCallback(() => reconnectRealtimeNow(), []);
  return { state, retryNow };
}
