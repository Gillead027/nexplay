import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import {
  ATTACHMENT_INLINE_IMAGE_TYPES,
  ATTACHMENT_MAX_PER_MESSAGE,
  ATTACHMENT_MAX_SIZE_BYTES,
  CHAT_MESSAGE_MAX_LENGTH,
  type DmChannel,
  type DmMessage,
  type MessageAttachment,
  type UserSession,
} from '@nexplay/shared';
import { api, NetworkError } from '../api';
import { FailedMessages } from './FailedMessages';
import { MessageSkeleton } from './Skeleton';
import { onRealtimeConnect, onRealtimeEvent } from '../realtime';
import { MarkdownText } from './Markdown';
import { MessageAttachments } from './TextChannels';
import { Avatar } from './Workspace';
import { AttachmentIcon, CheckIcon, CloseIcon, CopyIcon, EditIcon, FileIcon, ForwardIcon, TrashIcon, PhoneIcon } from './Icons';
import { copyLabel, useCopyFeedback } from '../useCopyFeedback';
import { TypingIndicator } from './TypingIndicator';
import { useTypingIndicator, useTypingSender } from '../useTypingIndicator';

// Mesma ideia de applyIncomingMessage em TextChannels.tsx, só que essa cópia
// pequena é deliberada (ver plano) — DM não precisa de reação/pin, e esse
// arquivo não exporta seus utilitários internos.
function applyIncomingMessage(current: DmMessage[], incoming: DmMessage): DmMessage[] {
  const index = current.findIndex(({ id }) => id === incoming.id);
  const next = index < 0 ? [...current, incoming] : current.map((message, position) => (position === index ? incoming : message));
  return next.sort((left, right) => left.sentAt - right.sentAt);
}

interface FailedDmSend {
  id: string;
  dmChannelId: string;
  text: string;
  attachmentIds: string[];
}

function isInlineImage(attachment: MessageAttachment): boolean {
  return (ATTACHMENT_INLINE_IMAGE_TYPES as readonly string[]).includes(attachment.contentType);
}

function DmMessageEditForm({
  initialText,
  onSave,
  onCancel,
}: {
  initialText: string;
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  async function save() {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="message-edit-form">
      <textarea
        ref={textareaRef}
        rows={1}
        maxLength={CHAT_MESSAGE_MAX_LENGTH}
        value={text}
        disabled={saving}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void save();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="message-edit-hint">escape para cancelar · enter para salvar</div>
    </div>
  );
}

export function DmChannelView({
  channel,
  session,
  isBlockedByMe,
  onOpenProfile,
  onForward,
  call,
}: {
  channel: DmChannel;
  session: UserSession;
  isBlockedByMe: boolean;
  onOpenProfile: (userId: string, event: { currentTarget: HTMLElement }) => void;
  onForward: (message: DmMessage) => void;
  // Botão de ligar no cabeçalho ("Ligar", "Atender", "Entrar na ligação"...); ausente quando já se está na ligação (o painel dela cuida).
  call?: { label: string; onClick: () => void; disabled?: boolean } | undefined;
}) {
  const other = channel.participants.find((participant) => participant.id !== session.id) ?? channel.participants[0]!;
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  // Mensagens que não saíram por falta de conexão (ficam até serem reenviadas ou descartadas).
  const [failedSends, setFailedSends] = useState<FailedDmSend[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const failedSequence = useRef(0);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  // Arquivos já enviados ao servidor (pendentes) que vão junto da próxima mensagem.
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const copyFeedback = useCopyFeedback();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingNames = useTypingIndicator({ kind: 'dm', dmChannelId: channel.id }, session.id);
  const notifyTyping = useTypingSender(channel.id, () => api.sendDmTyping(channel.id), session.presenceStatus === 'invisible');

  useEffect(() => {
    let active = true;
    setMessages([]);
    setDraft('');
    setLoading(true);
    setError('');
    setEditingMessageId(null);
    setPendingAttachments([]);
    setAttachmentError('');

    const refresh = async () => {
      try {
        const result = await api.getDmMessages(channel.id);
        if (active) setMessages(result.messages);
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar as mensagens.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void refresh();
    const unsubscribeReconnect = onRealtimeConnect(() => void refresh());
    return () => {
      active = false;
      unsubscribeReconnect();
    };
  }, [channel.id]);

  useEffect(() => {
    return onRealtimeEvent((event) => {
      if (event.type === 'DM_MESSAGE_CREATE' || event.type === 'DM_MESSAGE_UPSERT') {
        if (event.dmChannelId !== channel.id) return;
        setMessages((current) => applyIncomingMessage(current, event.message));
        window.requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
      } else if (event.type === 'DM_MESSAGE_DELETE') {
        if (event.dmChannelId !== channel.id) return;
        setMessages((current) => current.filter(({ id }) => id !== event.messageId));
      }
    });
  }, [channel.id]);

  useEffect(() => {
    if (!loading) endRef.current?.scrollIntoView({ block: 'end' });
  }, [channel.id, loading]);

  // Sobe os arquivos escolhidos um a um (respeitando o limite por mensagem e o tamanho máximo); cada
  // um fica "pendente" no servidor até a mensagem ser enviada, igual nos canais de texto.
  async function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setAttachmentError('');
    const room = ATTACHMENT_MAX_PER_MESSAGE - pendingAttachments.length;
    if (files.length > room) setAttachmentError(`Você pode anexar no máximo ${ATTACHMENT_MAX_PER_MESSAGE} arquivos por mensagem.`);
    setUploading(true);
    try {
      for (const file of files.slice(0, Math.max(0, room))) {
        if (file.size > ATTACHMENT_MAX_SIZE_BYTES) {
          setAttachmentError(`"${file.name}" passa de ${Math.floor(ATTACHMENT_MAX_SIZE_BYTES / 1024 / 1024)} MB.`);
          continue;
        }
        try {
          const { attachment } = await api.uploadDmAttachment(channel.id, file);
          setPendingAttachments((current) => [...current, attachment]);
        } catch (requestError) {
          setAttachmentError(requestError instanceof Error ? requestError.message : 'Não foi possível enviar o arquivo.');
        }
      }
    } finally {
      setUploading(false);
    }
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    const attachmentIds = pendingAttachments.map(({ id }) => id);
    if ((!text && attachmentIds.length === 0) || sending || uploading) return;
    setSending(true);
    setError('');
    try {
      await deliverDm(text, attachmentIds);
      setDraft('');
      setPendingAttachments([]);
      inputRef.current?.focus();
    } catch (requestError) {
      if (requestError instanceof NetworkError) {
        // Sem conexão: a mensagem sai do campo e fica no fim da conversa como "não enviada".
        failedSequence.current += 1;
        setFailedSends((current) => [...current, { id: `falha-${failedSequence.current}`, dmChannelId: channel.id, text, attachmentIds }]);
        setDraft('');
        setPendingAttachments([]);
        window.requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
      } else {
        setError(requestError instanceof Error ? requestError.message : 'Não foi possível enviar a mensagem.');
      }
    } finally {
      setSending(false);
    }
  }

  async function deliverDm(text: string, attachmentIds: string[] = []) {
    const { message } = await api.sendDmMessage(channel.id, text, attachmentIds);
    setMessages((current) => applyIncomingMessage(current, message));
    window.requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
  }

  async function retryFailedSend(item: FailedDmSend) {
    if (retryingId) return;
    setRetryingId(item.id);
    setError('');
    try {
      await deliverDm(item.text, item.attachmentIds);
      setFailedSends((current) => current.filter(({ id }) => id !== item.id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setRetryingId(null);
    }
  }

  async function saveEdit(messageId: string, text: string) {
    try {
      const { message } = await api.editDmMessage(channel.id, messageId, text);
      setMessages((current) => applyIncomingMessage(current, message));
      setEditingMessageId(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível editar a mensagem.');
    }
  }

  async function deleteMessage(messageId: string) {
    if (!window.confirm('Apagar esta mensagem? Essa ação não pode ser desfeita.')) return;
    try {
      await api.deleteDmMessage(channel.id, messageId);
      setMessages((current) => current.filter(({ id }) => id !== messageId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível apagar a mensagem.');
    }
  }

  // Sem gate de timeout aqui de propósito: timeout passou a ser por servidor
  // (ver DISCORD_PARITY_PLAN.md) — DM é uma conversa fora de qualquer servidor.
  const composerDisabled = isBlockedByMe;

  return (
    <section className="text-channel-view dm-channel-view" aria-label={`Conversa com ${other.displayName}`}>
      <header className="room-header dm-channel-header">
        <button type="button" className="dm-header-identity" onClick={(event) => onOpenProfile(other.id, event)}>
          <Avatar name={other.displayName} accentColor={other.accentColor} avatarUrl={other.avatarUrl} frame={other.avatarFrame} />
          <strong>{other.displayName}</strong>
        </button>
        {call && (
          <button type="button" className="dm-call-button" onClick={call.onClick} disabled={call.disabled} title={call.label} aria-label={call.label}>
            <PhoneIcon size={16} /> <span>{call.label}</span>
          </button>
        )}
      </header>
      {error && <div className="error-banner" role="alert"><span>{error}</span></div>}
      <div className="messages text-channel-messages" role="log" aria-live="polite" aria-busy={loading}>
        {loading ? (
          <MessageSkeleton />
        ) : messages.length === 0 ? (
          <div className="text-channel-welcome">
            <span aria-hidden="true">@</span>
            <h2>Essa é a conversa com {other.displayName}</h2>
            <p>Diga oi!</p>
          </div>
        ) : (
          messages.map((message) => {
            const sender = channel.participants.find((participant) => participant.id === message.senderId) ?? other;
            const isOwn = message.senderId === session.id;
            return (
              <article className="message text-message" key={message.id}>
                <button type="button" className="message-avatar-trigger" onClick={(event) => onOpenProfile(sender.id, event)}>
                  <Avatar name={sender.displayName} accentColor={sender.accentColor} avatarUrl={sender.avatarUrl} frame={sender.avatarFrame} compact />
                </button>
                <div>
                  <header>
                    <button type="button" className="message-name-trigger" onClick={(event) => onOpenProfile(sender.id, event)}>
                      {sender.displayName}
                    </button>
                    <time dateTime={new Date(message.sentAt).toISOString()}>
                      {new Date(message.sentAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </time>
                    {message.editedAt && <span className="message-edited-mark" title="Mensagem editada">(editado)</span>}
                  </header>
                  {message.forwardedFromAuthorName && (
                    <p className="message-forwarded-mark"><ForwardIcon size={11} /> Encaminhada de {message.forwardedFromAuthorName}</p>
                  )}
                  {editingMessageId === message.id ? (
                    <DmMessageEditForm initialText={message.text} onSave={(text) => saveEdit(message.id, text)} onCancel={() => setEditingMessageId(null)} />
                  ) : message.text ? (
                    <p><MarkdownText text={message.text} /></p>
                  ) : null}
                  {message.attachments?.length ? <MessageAttachments attachments={message.attachments} /> : null}
                </div>
                <div className="message-hover-actions" role="toolbar" aria-label="Ações da mensagem">
                  <button
                    type="button"
                    className={copyFeedback.statusFor(message.id) === 'idle' ? undefined : `copy-${copyFeedback.statusFor(message.id)}`}
                    title={copyLabel(copyFeedback.statusFor(message.id))}
                    aria-label={copyLabel(copyFeedback.statusFor(message.id))}
                    onClick={() => void copyFeedback.copy(message.id, message.text)}
                  >
                    {copyFeedback.statusFor(message.id) === 'copied' ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                  </button>
                  <button type="button" title="Encaminhar" aria-label="Encaminhar" onClick={() => onForward(message)}>
                    <ForwardIcon size={14} />
                  </button>
                  {isOwn && (
                    <>
                      <button type="button" title="Editar mensagem" aria-label="Editar mensagem" onClick={() => setEditingMessageId(message.id)}>
                        <EditIcon size={14} />
                      </button>
                      <button type="button" title="Apagar mensagem" aria-label="Apagar mensagem" onClick={() => void deleteMessage(message.id)}>
                        <TrashIcon size={14} />
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })
        )}
        <FailedMessages
          items={failedSends.filter(({ dmChannelId }) => dmChannelId === channel.id)}
          retryingId={retryingId}
          onRetry={(item) => void retryFailedSend(item)}
          onDiscard={(item) => setFailedSends((current) => current.filter(({ id }) => id !== item.id))}
        />
        <div ref={endRef} />
      </div>
      {isBlockedByMe && (
        <div className="reply-composer-banner timeout-composer-banner">
          <span>Você bloqueou {other.displayName} — desbloqueie pra continuar a conversa.</span>
        </div>
      )}
      {attachmentError && (
        <div className="reply-composer-banner timeout-composer-banner">
          <span>{attachmentError}</span>
          <button type="button" aria-label="Fechar aviso" onClick={() => setAttachmentError('')}>
            <CloseIcon size={13} />
          </button>
        </div>
      )}
      {pendingAttachments.length > 0 && (
        <div className="pending-attachments-strip">
          {pendingAttachments.map((attachment) => (
            <div className="pending-attachment-chip" key={attachment.id}>
              {isInlineImage(attachment) ? <img src={attachment.url} alt="" /> : <FileIcon size={16} />}
              <span>{attachment.filename}</span>
              <button
                type="button"
                aria-label={`Remover ${attachment.filename}`}
                onClick={() => setPendingAttachments((current) => current.filter(({ id }) => id !== attachment.id))}
              >
                <CloseIcon size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <TypingIndicator names={typingNames} />
      <form className="text-channel-form" onSubmit={submitMessage}>
        <div className="text-channel-input-row">
          <input ref={fileInputRef} type="file" multiple className="sr-only" onChange={(event) => void handleFilesSelected(event)} />
          <button
            type="button"
            className="text-channel-attach-button"
            title="Anexar arquivo"
            aria-label="Anexar arquivo"
            disabled={composerDisabled || uploading || pendingAttachments.length >= ATTACHMENT_MAX_PER_MESSAGE}
            onClick={() => fileInputRef.current?.click()}
          >
            <AttachmentIcon size={17} />
          </button>
          <label className="sr-only" htmlFor="dm-message">Mensagem para {other.displayName}</label>
          <textarea
            ref={inputRef}
            id="dm-message"
            rows={1}
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            value={draft}
            disabled={composerDisabled}
            onChange={(event) => {
              setDraft(event.target.value);
              notifyTyping(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={composerDisabled ? '' : uploading ? 'Enviando arquivo…' : `Conversar com ${other.displayName}`}
          />
        </div>
        <div className="text-channel-form-meta">
          <span>{draft.length}/{CHAT_MESSAGE_MAX_LENGTH}</span>
          <button
            type="submit"
            disabled={composerDisabled || sending || uploading || (!draft.trim() && pendingAttachments.length === 0)}
          >
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </section>
  );
}
