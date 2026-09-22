import { useEffect, useId, useRef, useState } from 'react';
import {
  CHANNEL_TOPIC_MAX_LENGTH,
  SERVER_ICON_DATA_URL_MAX_LENGTH,
  SLOW_MODE_OPTIONS_SECONDS,
  TEXT_CHANNEL_NAME_MAX_LENGTH,
  WEBHOOK_NAME_MAX_LENGTH,
  WEBHOOKS_MAX_PER_CHANNEL,
  type Category,
  type ContentVisibility,
  type TextChannel,
  type TextWebhook,
} from '@nexplay/shared';
import { api } from '../api';
import { SettingsIcon, SmileIcon, TrashIcon } from './Icons';
import { EmojiPicker } from './EmojiPicker';
import { InvitesPane } from './ServerSettings';
import { fileToResizedDataUrl } from '../imageResize';
import { copyLabel, useCopyFeedback } from '../useCopyFeedback';

function slowModeLabel(seconds: number): string {
  if (seconds === 0) return 'Desligado';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3_600)} h`;
}

type Tab = 'overview' | 'permissions' | 'invites' | 'integrations';

export function TextChannelSettingsModal({
  channel,
  serverId,
  categories,
  canManageServer,
  canManageWebhooks,
  onUpdated,
  onDeleted,
}: {
  channel: TextChannel;
  serverId: string;
  categories: Category[];
  canManageServer: boolean;
  canManageWebhooks: boolean;
  onUpdated: (channel: TextChannel) => void;
  onDeleted: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const emojiButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [tab, setTab] = useState<Tab>('overview');
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic);
  const [categoryId, setCategoryId] = useState(channel.categoryId ?? '');
  const [slowMode, setSlowMode] = useState(channel.slowModeSeconds);
  const [visibility, setVisibility] = useState<ContentVisibility>(channel.contentVisibility);
  const [announcement, setAnnouncement] = useState(channel.isAnnouncement);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setName(channel.name);
    setTopic(channel.topic);
    setCategoryId(channel.categoryId ?? '');
    setSlowMode(channel.slowModeSeconds);
    setVisibility(channel.contentVisibility);
    setAnnouncement(channel.isAnnouncement);
    setTab('overview');
    setError('');
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      let updated = channel;
      if (name.trim() !== channel.name) {
        const renamed = await api.renameChannel(serverId, 'text', channel.id, name.trim());
        updated = renamed.channel as TextChannel;
      }
      const result = await api.updateTextChannelSettings(serverId, channel.id, {
        categoryId: categoryId || null,
        topic,
        slowModeSeconds: slowMode,
        contentVisibility: visibility,
        isAnnouncement: announcement,
      });
      onUpdated({ ...result.channel, name: updated.name });
      dialog.current?.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar as configurações.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (saving || !window.confirm(`Excluir o canal #${channel.name}? Isso não pode ser desfeito.`)) return;
    setSaving(true);
    try {
      await api.deleteTextChannel(serverId, channel.id);
      dialog.current?.close();
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir o canal.');
      setSaving(false);
    }
  }

  return <>
    <button type="button" className="rename-channel-button" title="Configurações do canal"
      aria-label={`Configurações do canal ${channel.name}`}
      onClick={() => { reset(); dialog.current?.showModal(); }}>
      <SettingsIcon size={14} />
    </button>
    <dialog ref={dialog} className="channel-settings-dialog" aria-labelledby={titleId}
      onCancel={(event) => { if (saving) event.preventDefault(); }}>
      <div className="channel-settings-layout">
        <nav className="channel-settings-tabs" aria-label="Seções de configuração">
          <h2 id={titleId}>#{channel.name}</h2>
          <button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Visão geral</button>
          <button type="button" className={tab === 'permissions' ? 'active' : ''} onClick={() => setTab('permissions')}>Permissões</button>
          <button type="button" className={tab === 'invites' ? 'active' : ''} onClick={() => setTab('invites')}>Convites</button>
          <button type="button" className={tab === 'integrations' ? 'active' : ''} onClick={() => setTab('integrations')}>Integrações</button>
        </nav>
        <div className="channel-settings-body">
          <button type="button" className="dialog-close" aria-label="Fechar" onClick={() => dialog.current?.close()}>×</button>
          {tab === 'overview' && (
            <div className="channel-settings-section">
              <label htmlFor={`${titleId}-name`}>Nome do canal</label>
              <div className="channel-name-field">
                <button ref={emojiButton} type="button" className="emoji-trigger" aria-label="Escolher emoji"
                  onClick={() => setEmojiOpen(true)}><SmileIcon size={16} /></button>
                <input ref={nameInput} id={`${titleId}-name`} value={name} maxLength={TEXT_CHANNEL_NAME_MAX_LENGTH}
                  onChange={(event) => setName(event.target.value)} />
              </div>
              {emojiOpen && emojiButton.current && (
                <EmojiPicker anchorRect={emojiButton.current.getBoundingClientRect()}
                  onSelect={(emoji) => { setName((current) => `${emoji} ${current}`.trim()); setEmojiOpen(false); }}
                  onClose={() => setEmojiOpen(false)} />
              )}

              <label htmlFor={`${titleId}-category`}>Categoria</label>
              <select id={`${titleId}-category`} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Sem categoria</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>

              <label htmlFor={`${titleId}-topic`}>Assunto do canal</label>
              <textarea id={`${titleId}-topic`} value={topic} maxLength={CHANNEL_TOPIC_MAX_LENGTH} rows={3}
                placeholder="Mostre pra todo mundo como se usa este canal!"
                onChange={(event) => setTopic(event.target.value)} />
              <small className="char-counter">{topic.length}/{CHANNEL_TOPIC_MAX_LENGTH}</small>

              <label htmlFor={`${titleId}-slowmode`}>Modo Lento</label>
              <select id={`${titleId}-slowmode`} value={slowMode} onChange={(event) => setSlowMode(Number(event.target.value))}>
                {SLOW_MODE_OPTIONS_SECONDS.map((seconds) => <option key={seconds} value={seconds}>{slowModeLabel(seconds)}</option>)}
              </select>
              <small>Membros só poderão enviar uma mensagem a cada intervalo deste.</small>

              <fieldset className="visibility-fieldset">
                <legend>Visibilidade do conteúdo</legend>
                <label><input type="radio" name={`${titleId}-visibility`} checked={visibility === 'default'}
                  onChange={() => setVisibility('default')} /> Padrão — o conteúdo do canal fica sempre visível.</label>
                <label><input type="radio" name={`${titleId}-visibility`} checked={visibility === 'spoiler'}
                  onChange={() => setVisibility('spoiler')} /> Canal de spoiler</label>
                <label><input type="radio" name={`${titleId}-visibility`} checked={visibility === 'age_restricted'}
                  onChange={() => setVisibility('age_restricted')} /> Canal com restrição de idade</label>
              </fieldset>

              <label className="toggle-row">
                <span>Canal de Anúncios</span>
                <input type="checkbox" checked={announcement} onChange={(event) => setAnnouncement(event.target.checked)} />
              </label>

              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="channel-settings-actions">
                <button type="button" className="danger-link" onClick={() => void remove()} disabled={saving}>
                  <TrashIcon size={14} /> Excluir canal
                </button>
                <button type="button" className="primary-button" disabled={saving || !name.trim()} onClick={() => void save()}>
                  {saving ? 'Salvando…' : 'Salvar alterações'}
                </button>
              </div>
            </div>
          )}
          {tab === 'permissions' && (
            <p className="channel-settings-stub">
              Permissões específicas deste canal ainda não são suportadas — gerencie o acesso pelos Cargos do servidor.
            </p>
          )}
          {tab === 'invites' && <InvitesPane serverId={serverId} canManageServer={canManageServer} />}
          {tab === 'integrations' && (
            <WebhooksPane serverId={serverId} channelId={channel.id} canManageWebhooks={canManageWebhooks} />
          )}
        </div>
      </div>
    </dialog>
  </>;
}

// Um webhook aqui é a URL inteira (id + token) — qualquer serviço externo
// que souber ela posta mensagens neste canal sem conta no NexPlay, igual um
// webhook de canal do Discord real (ver apps/api/src/webhooks.ts).
function WebhooksPane({
  serverId,
  channelId,
  canManageWebhooks,
}: {
  serverId: string;
  channelId: string;
  canManageWebhooks: boolean;
}) {
  const [webhooks, setWebhooks] = useState<TextWebhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [creating, setCreating] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const { copy, statusFor } = useCopyFeedback();

  useEffect(() => {
    if (!canManageWebhooks) {
      setLoading(false);
      return;
    }
    let active = true;
    void api.getWebhooks(serverId, channelId)
      .then(({ webhooks }) => { if (active) setWebhooks(webhooks); })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar os webhooks.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [serverId, channelId, canManageWebhooks]);

  async function handleAvatarFile(file: File | undefined) {
    if (!file) return;
    setAvatarError('');
    try {
      setAvatarUrl(await fileToResizedDataUrl(file, 256, SERVER_ICON_DATA_URL_MAX_LENGTH, true));
    } catch {
      setAvatarError('Não foi possível usar essa imagem. Tente um arquivo menor.');
    }
  }

  async function create() {
    if (creating || !name.trim()) return;
    setCreating(true);
    setError('');
    try {
      const { webhook } = await api.createWebhook(serverId, channelId, name.trim(), avatarUrl);
      setWebhooks((current) => [...current, webhook]);
      setName('');
      setAvatarUrl('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível criar o webhook.');
    } finally {
      setCreating(false);
    }
  }

  async function remove(webhookId: string) {
    if (!window.confirm('Apagar este webhook? Qualquer serviço externo que use a URL dele para de conseguir postar aqui.')) return;
    setError('');
    try {
      await api.deleteWebhook(serverId, channelId, webhookId);
      setWebhooks((current) => current.filter((webhook) => webhook.id !== webhookId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível apagar o webhook.');
    }
  }

  if (!canManageWebhooks) {
    return <p className="channel-settings-stub">Só quem gerencia webhooks pode ver e criar webhooks deste canal.</p>;
  }
  if (loading) return <p className="channel-settings-stub">Carregando…</p>;

  const atLimit = webhooks.length >= WEBHOOKS_MAX_PER_CHANNEL;

  return (
    <div className="webhooks-pane">
      <p className="channel-settings-hint">
        Qualquer serviço que souber a URL de um webhook pode postar mensagens neste canal, sem conta no NexPlay — igual no Discord.
      </p>
      {error && <p className="form-error" role="alert">{error}</p>}

      <ul className="webhooks-list">
        {webhooks.map((webhook) => {
          const url = `${window.location.origin}/api/webhooks/${webhook.id}/${webhook.token}`;
          return (
            <li key={webhook.id} className="webhooks-list-item">
              <div className="webhooks-list-avatar" aria-hidden="true">
                {webhook.avatarUrl ? <img src={webhook.avatarUrl} alt="" draggable={false} /> : <SettingsIcon size={16} />}
              </div>
              <div className="webhooks-list-info">
                <strong>{webhook.name}</strong>
                <code className="webhooks-list-url">{url}</code>
              </div>
              <div className="webhooks-list-actions">
                <button type="button" onClick={() => void copy(webhook.id, url)}>{copyLabel(statusFor(webhook.id))}</button>
                <button type="button" className="danger-link" aria-label={`Apagar webhook ${webhook.name}`}
                  onClick={() => void remove(webhook.id)}>
                  <TrashIcon size={14} />
                </button>
              </div>
            </li>
          );
        })}
        {webhooks.length === 0 && <li className="webhooks-list-empty">Nenhum webhook ainda.</li>}
      </ul>

      <div className="webhooks-create">
        <h3>Novo webhook</h3>
        <div className="webhooks-create-row">
          <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
            onChange={(event) => void handleAvatarFile(event.target.files?.[0])} />
          <button type="button" className="webhooks-avatar-trigger" aria-label="Escolher avatar do webhook"
            onClick={() => avatarInputRef.current?.click()}>
            {avatarUrl ? <img src={avatarUrl} alt="" draggable={false} /> : <SettingsIcon size={18} />}
          </button>
          <input value={name} maxLength={WEBHOOK_NAME_MAX_LENGTH} placeholder="Nome do webhook"
            onChange={(event) => setName(event.target.value)} disabled={atLimit} />
        </div>
        {avatarError && <p className="form-error" role="alert">{avatarError}</p>}
        <button type="button" className="primary-button" disabled={creating || !name.trim() || atLimit}
          onClick={() => void create()}>
          {creating ? 'Criando…' : 'Criar webhook'}
        </button>
        {atLimit && <small>Limite de {WEBHOOKS_MAX_PER_CHANNEL} webhooks por canal atingido.</small>}
      </div>
    </div>
  );
}
