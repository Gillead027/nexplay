import { type FormEvent, type RefObject, useCallback, useEffect, useId, useRef, useState } from 'react';
import { SERVER_DESCRIPTION_MAX_LENGTH, SERVER_NAME_MAX_LENGTH, type Server, type ServerMember, type UserSession } from '@nexplay/shared';
import { api } from '../api';
import { onRealtimeConnect, onRealtimeEvent } from '../realtime';
import { CloseIcon } from './Icons';
import { useEscapeLayer } from '../escapeLayers';

// Mesmo padrão de useFriendsState (Friends.tsx) — um único fetch + assinatura
// de tempo real, centralizado em Workspace.tsx, alimenta a rail de
// servidores e o modal de adicionar servidor ao mesmo tempo.
export function useServersState(session: UserSession): { servers: Server[]; loaded: boolean; refresh: () => void } {
  const [servers, setServers] = useState<Server[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    void api.getServers().then(({ servers }) => { setServers(servers); setLoaded(true); }).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribeConnect = onRealtimeConnect(refresh);
    const unsubscribeEvent = onRealtimeEvent((event) => {
      if (event.type === 'SERVER_CREATE') {
        setServers((current) => (current.some((server) => server.id === event.server.id) ? current : [...current, event.server]));
      } else if (event.type === 'SERVER_UPDATE') {
        setServers((current) => current.map((server) => (server.id === event.server.id ? event.server : server)));
      } else if (event.type === 'SERVER_DELETE') {
        setServers((current) => current.filter((server) => server.id !== event.serverId));
      } else if (event.type === 'MEMBER_LEAVE' && event.userId === session.id) {
        setServers((current) => current.filter((server) => server.id !== event.serverId));
      }
    });
    return () => {
      unsubscribeConnect();
      unsubscribeEvent();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, refresh]);

  return { servers, loaded, refresh };
}

// A filiação (cargos/permissões/timeout) do próprio usuário no servidor
// ativo — desde a fundação de múltiplos servidores, isso deixou de viver em
// UserSession (um usuário pode ter cargos diferentes em cada servidor).
export function useActiveServerMember(serverId: string | null, session: UserSession): ServerMember | null {
  const [member, setMember] = useState<ServerMember | null>(null);

  const refresh = useCallback(() => {
    if (!serverId) {
      setMember(null);
      return;
    }
    void api.getServerMember(serverId).then(({ member }) => setMember(member)).catch(() => setMember(null));
  }, [serverId]);

  useEffect(() => {
    refresh();
    const unsubscribeConnect = onRealtimeConnect(refresh);
    const unsubscribeEvent = onRealtimeEvent((event) => {
      if (!serverId) return;
      if (
        (event.type === 'MEMBER_ROLES_UPDATE' || event.type === 'MEMBER_TIMEOUT_UPDATE') &&
        event.serverId === serverId &&
        event.userId === session.id
      ) {
        refresh();
      }
    });
    return () => {
      unsubscribeConnect();
      unsubscribeEvent();
    };
  }, [serverId, session.id, refresh]);

  return member;
}

export function AddServerModal({
  open,
  onClose,
  onServerReady,
  returnFocusRef,
  initialTab = 'create',
}: {
  open: boolean;
  onClose: () => void;
  onServerReady: (serverId: string) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  initialTab?: 'create' | 'join';
}) {
  const [tab, setTab] = useState<'create' | 'join'>(initialTab);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const titleId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    onClose();
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  }, [onClose, returnFocusRef]);

  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setInviteCode('');
    setError('');
    setTab(initialTab);
    window.requestAnimationFrame(() => nameInputRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEscapeLayer(open, () => {
    if (!saving) close();
  });

  if (!open) return null;

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const { server } = await api.createServer(name.trim(), description);
      onServerReady(server.id);
      close();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível criar o servidor.');
    } finally {
      setSaving(false);
    }
  }

  async function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteCode.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const { server } = await api.redeemInvite(inviteCode.trim());
      onServerReady(server.id);
      close();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Convite inválido.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) close();
    }}>
      <div className="channel-dialog add-server-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header>
          <h2 id={titleId}>Adicionar servidor</h2>
          <button type="button" onClick={close} disabled={saving} aria-label="Fechar">
            <CloseIcon size={18} />
          </button>
        </header>
        <div className="entry-mode-toggle" role="tablist" aria-label="Criar ou entrar em um servidor">
          <button type="button" role="tab" aria-selected={tab === 'create'} className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}>
            Criar servidor
          </button>
          <button type="button" role="tab" aria-selected={tab === 'join'} className={tab === 'join' ? 'active' : ''} onClick={() => setTab('join')}>
            Entrar com convite
          </button>
        </div>
        {tab === 'create' ? (
          <form onSubmit={submitCreate}>
            <label htmlFor="new-server-name">Nome do servidor</label>
            <input
              ref={nameInputRef}
              id="new-server-name"
              maxLength={SERVER_NAME_MAX_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Meu servidor"
              required
            />
            <label htmlFor="new-server-description">Descrição <span>(opcional)</span></label>
            <input
              id="new-server-description"
              maxLength={SERVER_DESCRIPTION_MAX_LENGTH}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Sobre o que é este servidor?"
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            <footer>
              <button type="button" className="dialog-cancel" onClick={close} disabled={saving}>Cancelar</button>
              <button type="submit" className="primary-button" disabled={saving || !name.trim()}>
                {saving ? 'Criando…' : 'Criar servidor'}
              </button>
            </footer>
          </form>
        ) : (
          <form onSubmit={submitJoin}>
            <label htmlFor="invite-code">Código de convite</label>
            <input
              id="invite-code"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="Ex.: ABCD1234"
              required
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            <footer>
              <button type="button" className="dialog-cancel" onClick={close} disabled={saving}>Cancelar</button>
              <button type="submit" className="primary-button" disabled={saving || !inviteCode.trim()}>
                {saving ? 'Entrando…' : 'Entrar no servidor'}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}
