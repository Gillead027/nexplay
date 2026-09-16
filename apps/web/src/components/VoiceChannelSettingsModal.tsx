import { useId, useRef, useState } from 'react';
import {
  SLOW_MODE_OPTIONS_SECONDS,
  TEXT_CHANNEL_NAME_MAX_LENGTH,
  VOICE_BITRATE_MAX_KBPS,
  VOICE_BITRATE_MIN_KBPS,
  VOICE_USER_LIMIT_MAX,
  type Category,
  type ContentVisibility,
  type VideoQuality,
  type VoiceChannel,
} from '@nexplay/shared';
import { api } from '../api';
import { SettingsIcon, TrashIcon } from './Icons';

function slowModeLabel(seconds: number): string {
  if (seconds === 0) return 'Desligado';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3_600)} h`;
}

export function VoiceChannelSettingsModal({
  channel,
  serverId,
  categories,
  onUpdated,
  onDeleted,
}: {
  channel: VoiceChannel;
  serverId: string;
  categories: Category[];
  onUpdated: (channel: VoiceChannel) => void;
  onDeleted: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [name, setName] = useState(channel.name);
  const [categoryId, setCategoryId] = useState(channel.categoryId ?? '');
  const [slowMode, setSlowMode] = useState(channel.slowModeSeconds);
  const [visibility, setVisibility] = useState<ContentVisibility>(channel.contentVisibility);
  const [bitrate, setBitrate] = useState(channel.bitrateKbps || VOICE_BITRATE_MIN_KBPS);
  const [videoQuality, setVideoQuality] = useState<VideoQuality>(channel.videoQuality);
  const [userLimit, setUserLimit] = useState(channel.userLimit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setName(channel.name);
    setCategoryId(channel.categoryId ?? '');
    setSlowMode(channel.slowModeSeconds);
    setVisibility(channel.contentVisibility);
    setBitrate(channel.bitrateKbps || VOICE_BITRATE_MIN_KBPS);
    setVideoQuality(channel.videoQuality);
    setUserLimit(channel.userLimit);
    setError('');
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      let updated = channel;
      if (name.trim() !== channel.name) {
        const renamed = await api.renameChannel(serverId, 'voice', channel.id, name.trim());
        updated = renamed.channel as VoiceChannel;
      }
      const result = await api.updateVoiceChannelSettings(serverId, channel.id, {
        categoryId: categoryId || null,
        slowModeSeconds: slowMode,
        contentVisibility: visibility,
        bitrateKbps: bitrate,
        videoQuality,
        userLimit,
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
    if (saving || !window.confirm(`Excluir o canal de voz ${channel.name}? Isso não pode ser desfeito.`)) return;
    setSaving(true);
    try {
      await api.deleteVoiceChannel(serverId, channel.id);
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
    <dialog ref={dialog} className="channel-dialog voice-channel-settings-dialog" aria-labelledby={titleId}
      onCancel={(event) => { if (saving) event.preventDefault(); }}>
      <header><h2 id={titleId}>Visão geral</h2></header>
      <div className="channel-settings-section">
        <label htmlFor={`${titleId}-name`}>Nome do canal</label>
        <input id={`${titleId}-name`} value={name} maxLength={TEXT_CHANNEL_NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)} />

        <label htmlFor={`${titleId}-category`}>Categoria</label>
        <select id={`${titleId}-category`} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">Sem categoria</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>

        <label htmlFor={`${titleId}-slowmode`}>Modo Lento</label>
        <select id={`${titleId}-slowmode`} value={slowMode} onChange={(event) => setSlowMode(Number(event.target.value))}>
          {SLOW_MODE_OPTIONS_SECONDS.map((seconds) => <option key={seconds} value={seconds}>{slowModeLabel(seconds)}</option>)}
        </select>

        <fieldset className="visibility-fieldset">
          <legend>Visibilidade do conteúdo</legend>
          <label><input type="radio" name={`${titleId}-visibility`} checked={visibility === 'default'}
            onChange={() => setVisibility('default')} /> Padrão</label>
          <label><input type="radio" name={`${titleId}-visibility`} checked={visibility === 'spoiler'}
            onChange={() => setVisibility('spoiler')} /> Canal de spoiler</label>
          <label><input type="radio" name={`${titleId}-visibility`} checked={visibility === 'age_restricted'}
            onChange={() => setVisibility('age_restricted')} /> Canal com restrição de idade</label>
        </fieldset>

        <label htmlFor={`${titleId}-bitrate`}>Taxa de bits — {bitrate}kbps</label>
        <input id={`${titleId}-bitrate`} type="range" min={VOICE_BITRATE_MIN_KBPS} max={VOICE_BITRATE_MAX_KBPS}
          value={bitrate} onChange={(event) => setBitrate(Number(event.target.value))} />

        <fieldset className="visibility-fieldset">
          <legend>Qualidade do vídeo</legend>
          <label><input type="radio" name={`${titleId}-video`} checked={videoQuality === 'auto'}
            onChange={() => setVideoQuality('auto')} /> Auto</label>
          <label><input type="radio" name={`${titleId}-video`} checked={videoQuality === '720p'}
            onChange={() => setVideoQuality('720p')} /> 720p</label>
        </fieldset>

        <label htmlFor={`${titleId}-limit`}>Limite de usuários — {userLimit === 0 ? '∞' : userLimit}</label>
        <input id={`${titleId}-limit`} type="range" min={0} max={VOICE_USER_LIMIT_MAX}
          value={userLimit} onChange={(event) => setUserLimit(Number(event.target.value))} />

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
    </dialog>
  </>;
}
