import { useCallback, useEffect, useRef, useState } from 'react';
import { entryScriptOf, isNewVersion, runningEntryScript } from './appVersion';

const CHECK_EVERY_MS = 10 * 60 * 1000;
const MIN_GAP_MS = 30 * 1000;

// Avisa quando o NexPlay foi publicado de novo enquanto o app está aberto. Confere a cada 10 minutos e ao voltar para a
// janela (no máximo uma vez a cada 30 s). `dismiss` esconde o aviso dessa versão; uma publicação ainda mais nova avisa de novo.
export function useNewVersion(): { available: boolean; dismiss: () => void } {
  const [latest, setLatest] = useState<string | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const running = useRef(runningEntryScript()).current;
  const lastCheck = useRef(Date.now());

  useEffect(() => {
    if (!running) return undefined;
    let active = true;
    const check = async () => {
      if (Date.now() - lastCheck.current < MIN_GAP_MS) return;
      lastCheck.current = Date.now();
      try {
        const response = await fetch('/', { cache: 'no-store' });
        if (!response.ok) return;
        const script = entryScriptOf(await response.text());
        if (active && script) setLatest(script);
      } catch {
        // Sem rede agora: a próxima checagem tenta de novo.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const timer = window.setInterval(() => { lastCheck.current = 0; void check(); }, CHECK_EVERY_MS);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [running]);

  const dismiss = useCallback(() => setDismissedFor(latest), [latest]);
  return { available: isNewVersion(running, latest, dismissedFor), dismiss };
}
