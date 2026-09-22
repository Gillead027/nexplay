import { typingLabel } from '../typingState';

/** A faixa "Fulano está digitando…" acima do campo de mensagem. Fica sempre com a mesma altura para o chat não pular. */
export function TypingIndicator({ names }: { names: readonly string[] }) {
  return (
    <div className="typing-indicator" role="status" aria-live="polite">
      {names.length > 0 && (
        <>
          <span className="typing-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="typing-text">{typingLabel(names)}</span>
        </>
      )}
    </div>
  );
}
