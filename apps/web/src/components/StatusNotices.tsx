import { connectivityMessage, type ConnectivityState } from '../connectivity';

// Avisos fixos no topo, visíveis em qualquer tela (canal de texto, voz, amigos...): sem
// conexão com o servidor, erro de voz (com atalho quando é permissão negada) e aviso de
// aparelho conectado ou removido. Antes o erro de voz só aparecia na tela de voz.
export function StatusNotices({
  connectivity,
  onRetryConnection,
  error,
  errorAction,
  onDismissError,
  notice,
  onDismissNotice,
  inviteMessage,
  onDismissInvite,
  newVersion,
  onReload,
  onDismissNewVersion,
  inCall,
}: {
  connectivity: ConnectivityState;
  onRetryConnection: () => void;
  error: string;
  errorAction: 'microphone' | 'camera' | null;
  onDismissError: () => void;
  notice: string;
  onDismissNotice: () => void;
  inviteMessage: { text: string; failed: boolean } | null;
  onDismissInvite: () => void;
  newVersion: boolean;
  onReload: () => void;
  onDismissNewVersion: () => void;
  inCall: boolean;
}) {
  const connectionText = connectivityMessage(connectivity);
  const target = errorAction === 'camera' ? 'a câmera' : 'o microfone';
  const canOpenSystemSettings = Boolean(window.desktop?.openMediaSettings);

  if (!connectionText && !error && !notice && !inviteMessage && !newVersion) return null;
  return (
    <div className="floating-notices">
      {connectionText && (
        <div className="floating-notice warn" role="status">
          <span>{connectionText}</span>
          {connectivity === 'reconnecting' && (
            <button type="button" onClick={onRetryConnection}>Tentar agora</button>
          )}
        </div>
      )}
      {error && (
        <div className="floating-notice error" role="alert">
          <span>
            <strong>Erro:</strong> {error}
            {errorAction && !canOpenSystemSettings && (
              <small> No navegador, clique no cadeado ao lado do endereço, permita {target} e recarregue a página.</small>
            )}
          </span>
          {errorAction && canOpenSystemSettings && (
            <button type="button" onClick={() => void window.desktop?.openMediaSettings?.(errorAction)}>
              Abrir configurações do Windows
            </button>
          )}
          <button type="button" onClick={onDismissError}>Fechar</button>
        </div>
      )}
      {inviteMessage && (
        <div className={`floating-notice ${inviteMessage.failed ? 'error' : 'info'}`} role={inviteMessage.failed ? 'alert' : 'status'}>
          <span>{inviteMessage.text}</span>
          <button type="button" onClick={onDismissInvite}>Fechar</button>
        </div>
      )}
      {newVersion && (
        <div className="floating-notice info" role="status">
          <span>
            Há uma nova versão do NexPlay.
            {inCall && <small> Você está em uma chamada: atualizar desconecta da voz.</small>}
          </span>
          <button type="button" className="notice-primary" onClick={onReload}>Atualizar agora</button>
          <button type="button" onClick={onDismissNewVersion}>Depois</button>
        </div>
      )}
      {notice && (
        <div className="floating-notice info" role="status">
          <span>{notice}</span>
          <button type="button" onClick={onDismissNotice}>Fechar</button>
        </div>
      )}
    </div>
  );
}
