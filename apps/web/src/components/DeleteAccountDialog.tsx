import { useEffect, useState } from 'react';
import { useEscapeLayer } from '../escapeLayers';
import { CloseIcon } from './Icons';

export interface AccountDeletionServerPlan {
  serverId: string;
  name: string;
  action: 'transfer' | 'delete';
  newOwnerName: string | null;
  otherMembers: number;
}

export interface AccountDeletionPreview {
  servers: AccountDeletionServerPlan[];
  // Conta de administrador da instância: não pode ser excluída (senão o nome ficaria livre para outra pessoa assumir o cargo).
  blocked: boolean;
}

// Confirmação de excluir uma conta. Serve para a própria pessoa (pede a senha) e para o admin da instância apagando a conta de
// outra pessoa (pede para digitar o nome dela). Antes de confirmar mostra o que acontece com os servidores da conta.
export function DeleteAccountDialog({
  mode,
  targetName,
  loadPreview,
  onConfirm,
  onClose,
  onDeleted,
}: {
  mode: 'self' | 'admin';
  targetName: string;
  loadPreview: () => Promise<AccountDeletionPreview>;
  onConfirm: (password: string) => Promise<void>;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [preview, setPreview] = useState<AccountDeletionPreview | null>(null);
  const [password, setPassword] = useState('');
  const [typedName, setTypedName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    loadPreview()
      .then((loaded) => { if (active) setPreview(loaded); })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar os detalhes.');
      });
    return () => { active = false; };
    // Carrega uma vez ao abrir; `loadPreview` muda de identidade a cada renderização de quem chama.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Por cima das Configurações: um Esc fecha só este diálogo (e nada enquanto exclui).
  useEscapeLayer(true, () => { if (!deleting) onClose(); });

  async function confirm() {
    setDeleting(true);
    setError('');
    try {
      await onConfirm(password);
      onDeleted();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível excluir a conta.');
      setDeleting(false);
    }
  }

  const ready = mode === 'self' ? password.length > 0 : typedName === targetName;
  const blocked = preview?.blocked === true;
  const title = mode === 'self' ? 'Excluir minha conta' : `Excluir a conta de "${targetName}"`;

  return (
    <div className="dialog-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) onClose(); }}>
      <div className="channel-dialog delete-server-confirm" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div><h2>{title}</h2></div>
          <button type="button" onClick={onClose} disabled={deleting} aria-label="Fechar"><CloseIcon size={18} /></button>
        </header>
        <p>
          Essa ação é <strong>permanente</strong>. {mode === 'self' ? 'Sua conta' : 'A conta'} sai de todos os servidores, as mensagens
          enviadas (nos canais e nas conversas diretas), as amizades e os arquivos enviados são apagados pra sempre, e o nome de usuário
          fica livre para outra pessoa. Não tem como desfazer.
        </p>
        {!preview && !error && <p className="settings-hint">Carregando os detalhes…</p>}
        {preview && preview.servers.length > 0 && (
          <div>
            <p><strong>Servidores {mode === 'self' ? 'que você criou' : 'criados por essa conta'}:</strong></p>
            <ul className="account-deletion-list">
              {preview.servers.map((server) => (
                <li key={server.serverId}>
                  <strong>{server.name}</strong>:{' '}
                  {server.action === 'transfer'
                    ? `continua existindo e passa para ${server.newOwnerName} (${server.otherMembers} ${server.otherMembers === 1 ? 'pessoa' : 'pessoas'} no servidor)`
                    : 'será apagado, porque ninguém mais está nele'}
                </li>
              ))}
            </ul>
          </div>
        )}
        {blocked && (
          <p className="form-error" role="alert">
            Contas de administrador da instância não podem ser excluídas por aqui. Tire o nome de ADMIN_USERNAMES antes.
          </p>
        )}
        {!blocked && mode === 'self' && (
          <>
            <label htmlFor="delete-account-password">Digite sua senha pra confirmar</label>
            <input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
            />
          </>
        )}
        {!blocked && mode === 'admin' && (
          <>
            <label htmlFor="delete-account-name">Digite <strong>{targetName}</strong> pra confirmar</label>
            <input
              id="delete-account-name"
              value={typedName}
              onChange={(event) => setTypedName(event.target.value)}
              autoComplete="off"
              autoFocus
            />
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer>
          <button type="button" className="dialog-cancel" onClick={onClose} disabled={deleting}>Cancelar</button>
          <button type="button" className="danger-button" disabled={!preview || blocked || !ready || deleting} onClick={() => void confirm()}>
            {deleting ? 'Excluindo…' : 'Excluir conta'}
          </button>
        </footer>
      </div>
    </div>
  );
}
