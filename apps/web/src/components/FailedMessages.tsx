export interface FailedSendView {
  id: string;
  text: string;
}

// Mensagens que não saíram porque a conexão com o servidor caiu. Ficam no fim da conversa,
// no lugar em que apareceriam, em vez de sumir: a pessoa vê o que não foi e escolhe entre
// mandar de novo ou descartar. Nada é reenviado sozinho (uma resposta perdida poderia
// duplicar a mensagem).
export function FailedMessages<T extends FailedSendView>({
  items,
  retryingId,
  onRetry,
  onDiscard,
}: {
  items: T[];
  retryingId: string | null;
  onRetry: (item: T) => void;
  onDiscard: (item: T) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="failed-messages">
      {items.map((item) => (
        <div className="failed-message" role="alert" key={item.id}>
          <p className="failed-message-text">{item.text}</p>
          <div className="failed-message-actions">
            <span>Não enviada: sem conexão com o servidor.</span>
            <button type="button" onClick={() => onRetry(item)} disabled={retryingId !== null}>
              {retryingId === item.id ? 'Enviando…' : 'Tentar de novo'}
            </button>
            <button type="button" onClick={() => onDiscard(item)} disabled={retryingId === item.id}>Descartar</button>
          </div>
        </div>
      ))}
    </div>
  );
}
