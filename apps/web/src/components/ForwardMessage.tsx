import { useEffect, useId, useState } from 'react';
import type { FriendSummary, Server, TextChannel } from '@nexplay/shared';
import { api } from '../api';
import { Avatar } from './Workspace';
import { useEscapeLayer } from '../escapeLayers';
import { CloseIcon, ForwardIcon, SearchIcon } from './Icons';

export type ForwardSource =
  | { kind: 'channel'; serverId: string; channelId: string; messageId: string }
  | { kind: 'dm'; dmChannelId: string; messageId: string };

type SelectedDestination =
  | { kind: 'channel'; serverId: string; channelId: string }
  | { kind: 'friendDm'; friendId: string };

export function ForwardMessageModal({
  source,
  onClose,
  servers,
  friends,
}: {
  source: ForwardSource | null;
  onClose: () => void;
  servers: Server[];
  friends: FriendSummary[];
}) {
  const titleId = useId();
  const open = source !== null;
  const [query, setQuery] = useState('');
  const [channelsByServer, setChannelsByServer] = useState<Record<string, TextChannel[]>>({});
  const [selected, setSelected] = useState<SelectedDestination | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(null);
    setError('');
    setDone(false);
    // Não existe cache de "canais de todos os servidores" hoje — só o
    // servidor ativo tem canais carregados em Workspace.tsx — então o modal
    // busca na hora que abre, uma vez por servidor.
    void Promise.all(
      servers.map((server) => api.getTextChannels(server.id).then(({ channels }) => [server.id, channels] as const)),
    ).then((entries) => setChannelsByServer(Object.fromEntries(entries)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEscapeLayer(open, onClose);

  if (!source) return null;
  // Capturado em uma const à parte: fechos definidos depois de um `if`
  // não têm o estreitamento de tipo do parâmetro original propagado pelo
  // TypeScript (a função poderia, em teoria, rodar antes do guard).
  const activeSource = source;

  const normalizedQuery = query.trim().toLowerCase();
  const matches = (name: string) => !normalizedQuery || name.toLowerCase().includes(normalizedQuery);

  async function submit() {
    if (!selected || sending) return;
    setSending(true);
    setError('');
    try {
      const destination =
        selected.kind === 'channel'
          ? { kind: 'channel' as const, serverId: selected.serverId, channelId: selected.channelId }
          : { kind: 'dm' as const, dmChannelId: (await api.openDmChannel(selected.friendId)).channel.id };
      if (activeSource.kind === 'channel') {
        await api.forwardTextMessage(activeSource.serverId, activeSource.channelId, activeSource.messageId, destination);
      } else {
        await api.forwardDmMessage(activeSource.dmChannelId, activeSource.messageId, destination);
      }
      setDone(true);
      window.setTimeout(onClose, 900);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível encaminhar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="dialog-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !sending) onClose();
    }}>
      <div className="channel-dialog forward-message-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header>
          <h2 id={titleId}>Encaminhar mensagem</h2>
          <button type="button" onClick={onClose} disabled={sending} aria-label="Fechar">
            <CloseIcon size={18} />
          </button>
        </header>
        <label className="roles-search forward-search">
          <SearchIcon size={14} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar canal ou amigo"
          />
        </label>
        <div className="forward-destination-list">
          {servers.map((server) => {
            const channels = (channelsByServer[server.id] ?? []).filter((channel) => matches(channel.name) || matches(server.name));
            if (channels.length === 0) return null;
            return (
              <div className="forward-destination-group" key={server.id}>
                <span className="field-eyebrow">{server.name}</span>
                {channels.map((channel) => {
                  const isSelected = selected?.kind === 'channel' && selected.channelId === channel.id;
                  return (
                    <button
                      type="button"
                      key={channel.id}
                      className={`text-channel-button forward-destination-row ${isSelected ? 'active' : ''}`}
                      onClick={() => setSelected({ kind: 'channel', serverId: server.id, channelId: channel.id })}
                    >
                      <span className="channel-hash" aria-hidden="true">#</span>
                      <span>{channel.name}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {friends.filter((friend) => matches(friend.displayName)).length > 0 && (
            <div className="forward-destination-group">
              <span className="field-eyebrow">Mensagens diretas</span>
              {friends.filter((friend) => matches(friend.displayName)).map((friend) => {
                const isSelected = selected?.kind === 'friendDm' && selected.friendId === friend.id;
                return (
                  <button
                    type="button"
                    key={friend.id}
                    className={`text-channel-button forward-destination-row ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelected({ kind: 'friendDm', friendId: friend.id })}
                  >
                    <Avatar name={friend.displayName} accentColor={friend.accentColor} avatarUrl={friend.avatarUrl} compact />
                    <span>{friend.displayName}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer>
          <button type="button" className="dialog-cancel" onClick={onClose} disabled={sending}>Cancelar</button>
          <button type="button" className="primary-button" onClick={() => void submit()} disabled={!selected || sending}>
            {done ? 'Encaminhado!' : sending ? 'Encaminhando…' : (<><ForwardIcon size={14} /> Encaminhar</>)}
          </button>
        </footer>
      </div>
    </div>
  );
}
