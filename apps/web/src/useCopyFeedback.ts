import { useCallback, useEffect, useRef, useState } from 'react';
import { copyText } from './clipboard';

export type CopyStatus = 'idle' | 'copied' | 'failed';

// Guarda o resultado da última cópia por chave (por exemplo, o id da mensagem),
// pra o botão certo mostrar "Copiado!" ou o erro por um instante e depois
// voltar ao normal. Uma cópia nova em outra chave substitui a anterior.
export function useCopyFeedback(resetMs = 2_000) {
  const [state, setState] = useState<{ key: string; status: CopyStatus }>({ key: '', status: 'idle' });
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(
    async (key: string, text: string) => {
      const copied = await copyText(text);
      setState({ key, status: copied ? 'copied' : 'failed' });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setState({ key: '', status: 'idle' }), resetMs);
    },
    [resetMs],
  );

  const statusFor = useCallback((key: string): CopyStatus => (state.key === key ? state.status : 'idle'), [state]);

  return { copy, statusFor };
}

export function copyLabel(status: CopyStatus): string {
  if (status === 'copied') return 'Copiado!';
  if (status === 'failed') return 'Não foi possível copiar';
  return 'Copiar texto';
}
