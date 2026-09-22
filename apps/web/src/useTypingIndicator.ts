import { useCallback, useEffect, useRef, useState } from 'react';
import { onRealtimeEvent } from './realtime';
import { activeTypers, applyTypingEvent, shouldSendTyping, type Typer, type TypingScope } from './typingState';

// Nomes de quem está digitando na conversa aberta (o próprio usuário nunca aparece). O aviso some sozinho depois de uns
// segundos sem renovar e assim que a pessoa envia a mensagem.
export function useTypingIndicator(scope: TypingScope | null, ownId: string): string[] {
  const scopeKey = scope ? (scope.kind === 'channel' ? `c:${scope.serverId}:${scope.channelId}` : `d:${scope.dmChannelId}`) : '';
  const [typers, setTypers] = useState<readonly Typer[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    setTypers([]);
    if (!scope) return undefined;
    return onRealtimeEvent((event) => setTypers((current) => applyTypingEvent(current, event, scope, ownId, Date.now())));
    // scopeKey resume o escopo: só reinicia ao trocar de conversa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, ownId]);

  // Agenda uma nova renderização para o instante em que o aviso mais antigo expira.
  useEffect(() => {
    if (typers.length === 0) return undefined;
    const nextExpiry = Math.min(...typers.map((typer) => typer.until));
    const timer = window.setTimeout(() => setTick((value) => value + 1), Math.max(50, nextExpiry - Date.now() + 20));
    return () => window.clearTimeout(timer);
  }, [typers]);

  return activeTypers(typers, Date.now()).map((typer) => typer.name);
}

// Avisa o servidor que a pessoa está digitando, no máximo a cada poucos segundos por conversa. Quem está invisível não
// avisa (o "digitando" entregaria que a pessoa está por aqui).
export function useTypingSender(conversationKey: string, send: () => Promise<void>, invisible: boolean): (text: string) => void {
  const lastSentAt = useRef(0);
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });
  useEffect(() => {
    lastSentAt.current = 0;
  }, [conversationKey]);

  return useCallback(
    (text: string) => {
      const now = Date.now();
      if (!shouldSendTyping(text, lastSentAt.current, now, invisible)) return;
      lastSentAt.current = now;
      void sendRef.current().catch(() => undefined);
    },
    [invisible],
  );
}
