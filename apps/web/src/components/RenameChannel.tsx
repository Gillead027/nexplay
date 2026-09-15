import { useId, useRef, useState, type FormEvent } from 'react';
import { TEXT_CHANNEL_NAME_MAX_LENGTH, type TextChannel, type VoiceChannel } from '@sausixudos/shared';
import { api } from '../api';
import { SettingsIcon } from './Icons';

export function RenameChannel({ channel, kind, onRenamed }: {
  channel: TextChannel | VoiceChannel;
  kind: 'text' | 'voice';
  onRenamed: (channel: TextChannel | VoiceChannel) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const inputId = useId();
  const [name, setName] = useState(channel.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const result = await api.renameChannel(channel.serverId, kind, channel.id, name);
      onRenamed(result.channel);
      dialog.current?.close();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível renomear o canal.');
    } finally {
      setSaving(false);
    }
  }

  return <>
    <button type="button" className="rename-channel-button" title="Renomear canal"
      aria-label={`Renomear canal ${channel.name}`} onClick={() => {
        setName(channel.name);
        setError('');
        dialog.current?.showModal();
        input.current?.focus();
        input.current?.select();
      }}><SettingsIcon size={14} /></button>
    <dialog ref={dialog} className="channel-dialog rename-channel-dialog" aria-labelledby={titleId}
      onCancel={(event) => { if (saving) event.preventDefault(); }}>
      <form onSubmit={submit}>
        <header><h2 id={titleId}>Renomear canal de {kind === 'text' ? 'texto' : 'voz'}</h2></header>
        <label htmlFor={inputId}>Nome do canal</label>
        <input ref={input} id={inputId} value={name} maxLength={TEXT_CHANNEL_NAME_MAX_LENGTH}
          required disabled={saving} onChange={(event) => setName(event.target.value)} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer>
          <button type="button" className="dialog-cancel" disabled={saving} onClick={() => dialog.current?.close()}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving || !name.trim()}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </footer>
      </form>
    </dialog>
  </>;
}
