import { useEffect, useState } from 'react';
import { formatCallDuration } from '../callTimer';

// Mostra há quanto tempo a chamada está ativa. Tem o próprio relógio de 1 s: só este pedacinho se redesenha a cada segundo, a tela
// inteira não. Sem `startedAt` (ninguém de verdade na sala) não mostra nada.
export function CallTimer({ startedAt, className }: { startedAt: number | null | undefined; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt == null) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  if (startedAt == null) return null;
  const text = formatCallDuration(now - startedAt);
  return <time className={className} title="Tempo de chamada" aria-label={`Chamada ativa há ${text}`}>{text}</time>;
}
