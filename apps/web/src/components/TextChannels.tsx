import { lazy, Suspense, type ChangeEvent, type FormEvent, type RefObject, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { AvatarFrame } from '@nexplay/shared';
import {
  ATTACHMENT_INLINE_IMAGE_TYPES,
  ATTACHMENT_MAX_PER_MESSAGE,
  ATTACHMENT_MAX_SIZE_BYTES,
  CHAT_MESSAGE_MAX_LENGTH,
  hasPermission,
  MESSAGE_SEARCH_QUERY_MIN_LENGTH,
  Permission,
  TEXT_CHANNEL_DESCRIPTION_MAX_LENGTH,
  TEXT_CHANNEL_NAME_MAX_LENGTH,
  type MessageAttachment,
  type MusicCommandResponse,
  type ServerMember,
  type TextChannel,
  type TextMessage,
  type UserSession,
  type VoiceChannel,
} from '@nexplay/shared';
import { api, NetworkError } from '../api';
import { AvatarRing } from './AvatarRing';
import { PokemonCardView } from './PokemonCardView';
import { FailedMessages } from './FailedMessages';
import { MessageSkeleton } from './Skeleton';
import { routeTextChannelInput } from '../musicCommandRouting';
import { onRealtimeConnect, onRealtimeEvent } from '../realtime';
import { MarkdownText } from './Markdown';
import { MusicCard } from './MusicCard';
import { copyLabel, useCopyFeedback } from '../useCopyFeedback';
import {
  AttachmentIcon,
  CloseIcon,
  CheckIcon,
  CopyIcon,
  EditIcon,
  FileIcon,
  ForwardIcon,
  MessageIcon,
  PinIcon,
  ReplyIcon,
  SearchIcon,
  SettingsIcon,
  SmileIcon,
  TrashIcon,
  VoiceIcon,
} from './Icons';

const EmojiPicker = lazy(() =>
  import('./EmojiPicker').then((module) => ({ default: module.EmojiPicker })),
);

type MessageStyle = 'default' | 'compact' | 'grouped';

// Único ponto de mescla de uma mensagem nova/atualizada no array local —
// usado tanto pelo caminho otimista local (envio próprio) quanto pelos
// eventos de WebSocket, pra não duplicar a invariante "no máximo um card do
// bot por canal, substituído em vez de duplicado" em três lugares como
// antes. Reordena por sentAt porque eventos de WebSocket não têm garantia
// de ordem estrita entre reconexões.
function applyIncomingMessage(current: TextMessage[], incoming: TextMessage): TextMessage[] {
  const index = current.findIndex(({ id }) => id === incoming.id);
  const next = index < 0 ? [...current, incoming] : current.map((message, position) => (position === index ? incoming : message));
  return next.sort((left, right) => left.sentAt - right.sentAt);
}

// Aplica um add/remove de reação vindo do WebSocket direto no array local,
// sem precisar buscar a mensagem inteira de novo — os grupos por emoji só
// existem enquanto tiverem pelo menos um usuário.
function applyReactionChange(
  current: TextMessage[],
  messageId: string,
  emoji: string,
  userId: string,
  action: 'add' | 'remove',
): TextMessage[] {
  return current.map((message) => {
    if (message.id !== messageId) return message;
    const groups = message.reactions ?? [];
    const index = groups.findIndex((group) => group.emoji === emoji);

    if (action === 'add') {
      if (index < 0) return { ...message, reactions: [...groups, { emoji, userIds: [userId] }] };
      if (groups[index]!.userIds.includes(userId)) return message;
      const nextGroups = groups.map((group, position) =>
        position === index ? { ...group, userIds: [...group.userIds, userId] } : group,
      );
      return { ...message, reactions: nextGroups };
    }

    if (index < 0) return message;
    const remainingUserIds = groups[index]!.userIds.filter((id) => id !== userId);
    const nextGroups = remainingUserIds.length
      ? groups.map((group, position) => (position === index ? { ...group, userIds: remainingUserIds } : group))
      : groups.filter((_, position) => position !== index);
    const { reactions: _droppedReactions, ...rest } = message;
    return nextGroups.length ? { ...rest, reactions: nextGroups } : rest;
  });
}

const textAvatarCache = new Map<string, { avatarUrl: string; frame: AvatarFrame | '' }>();

function useTextAvatar(userId: string, session: UserSession): { avatarUrl: string | undefined; frame: AvatarFrame | '' } {
  const [, forceRender] = useState(0);
  useEffect(() => {
    if (userId === session.id || textAvatarCache.has(userId)) return;
    let active = true;
    void api.getUserAvatar(userId).then(({ avatarUrl, avatarFrame }) => {
      if (!active) return;
      textAvatarCache.set(userId, { avatarUrl, frame: avatarFrame ?? '' });
      forceRender((value) => value + 1);
    }).catch(() => {
      if (active) textAvatarCache.set(userId, { avatarUrl: '', frame: '' });
    });
    return () => {
      active = false;
    };
  }, [session.id, userId]);
  if (userId === session.id) return { avatarUrl: session.avatarUrl || undefined, frame: session.avatarFrame };
  const cached = textAvatarCache.get(userId);
  return { avatarUrl: cached?.avatarUrl || undefined, frame: cached?.frame ?? '' };
}

// As respostas do NexDex (o jogo de captura de Pokémon): o texto do bot e, quando tem, o cartão com o Pokémon.
function GameTextMessageRow({
  message,
  viewerId,
  onGameCommand,
}: {
  message: TextMessage;
  viewerId: string;
  onGameCommand: (command: string) => Promise<void>;
}) {
  return (
    <article className="message text-message game-message">
      <div className="game-bot-avatar" aria-hidden="true"><span /></div>
      <div className="game-message-content">
        <header className="nexmusic-message-header">
          <strong className="game-bot-name">{message.senderName}</strong>
          <span className="nexmusic-app-badge">APP</span>
          <time dateTime={new Date(message.sentAt).toISOString()}>
            {new Date(message.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </time>
        </header>
        {message.text && <p><MarkdownText text={message.text} /></p>}
        {message.pokemonCard && <PokemonCardView card={message.pokemonCard} viewerId={viewerId} onCommand={onGameCommand} />}
      </div>
    </article>
  );
}

function BotTextMessageRow({
  message,
  onMusicCommand,
}: {
  message: TextMessage;
  onMusicCommand: (command: string) => Promise<MusicCommandResponse>;
}) {
  return (
    <article className="message text-message nexmusic-message">
      <div className="nexmusic-bot-avatar" aria-hidden="true"><span className="nexmusic-avatar-bars"><i /><i /><i /></span></div>
      <div className="nexmusic-message-content">
        <header className="nexmusic-message-header">
          <strong>{message.senderName}</strong>
          <span className="nexmusic-app-badge">APP</span>
          <time dateTime={new Date(message.sentAt).toISOString()}>
            {new Date(message.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </time>
          <span className="nexmusic-sleep-mark" aria-hidden="true">zZ</span>
        </header>
        {message.musicCard ? (
          <MusicCard card={message.musicCard} onCommand={onMusicCommand} />
        ) : (
          <p><MarkdownText text={message.text} /></p>
        )}
      </div>
    </article>
  );
}

// Mensagem postada com a identidade do servidor (ver postedAsSystem,
// apps/api/src/textChannels.ts) — mesmo tratamento visual (avatar + selo
// APP) do card do NexMusic, mas sem nada específico de música: qualquer
// admin com MANAGE_MESSAGES usa isto pra publicar avisos/regras formatados
// como se fosse o próprio servidor falando, não um bot externo.
function SystemTextMessageRow({ message }: { message: TextMessage }) {
  return (
    <article className="message text-message system-message">
      <div className="system-message-avatar" aria-hidden="true">
        {message.senderAvatarUrl ? <img src={message.senderAvatarUrl} alt="" draggable={false} /> : <SettingsIcon size={18} />}
      </div>
      <div className="system-message-content">
        <header className="system-message-header">
          <strong>{message.senderName}</strong>
          <span className="system-app-badge">APP</span>
          <time dateTime={new Date(message.sentAt).toISOString()}>
            {new Date(message.sentAt).toLocaleDateString('pt-BR')} {new Date(message.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </time>
        </header>
        <p className="system-message-body"><MarkdownText text={message.text} /></p>
      </div>
    </article>
  );
}

// Textarea de edição inline — Enter salva, Shift+Enter quebra linha, Escape
// cancela, mesmo padrão de atalho do compositor principal de mensagem.
function MessageEditForm({
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
      <div className="message-edit-hint">
        escape para cancelar · enter para salvar
      </div>
    </div>
  );
}

function ReactionBar({
  message,
  ownUserId,
  onToggle,
}: {
  message: TextMessage;
  ownUserId: string;
  onToggle: (emoji: string, reacted: boolean) => void;
}) {
  if (!message.reactions?.length) return null;
  return (
    <div className="message-reactions">
      {message.reactions.map((group) => {
        const reacted = group.userIds.includes(ownUserId);
        return (
          <button
            key={group.emoji}
            type="button"
            className={`reaction-pill ${reacted ? 'reacted' : ''}`}
            onClick={() => onToggle(group.emoji, reacted)}
            title={reacted ? 'Você reagiu — clique para remover' : `${group.userIds.length} reação(ões)`}
          >
            <span aria-hidden="true">{group.emoji}</span>
            <span>{group.userIds.length}</span>
          </button>
        );
      })}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isInlineImageAttachment(attachment: MessageAttachment): boolean {
  return (ATTACHMENT_INLINE_IMAGE_TYPES as readonly string[]).includes(attachment.contentType);
}

function MessageAttachments({ attachments }: { attachments: MessageAttachment[] }) {
  return (
    <div className="message-attachments">
      {attachments.map((attachment) =>
        isInlineImageAttachment(attachment) ? (
          <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="message-attachment-image">
            <img src={attachment.url} alt={attachment.filename} loading="lazy" />
          </a>
        ) : (
          <a key={attachment.id} href={attachment.url} className="message-attachment-file" download={attachment.filename}>
            <FileIcon size={20} />
            <span className="message-attachment-file-info">
              <strong>{attachment.filename}</strong>
              <small>{formatFileSize(attachment.sizeBytes)}</small>
            </span>
          </a>
        ),
      )}
    </div>
  );
}

// Só o id é guardado (ver comentário em TextMessage.replyToMessageId no
// pacote compartilhado) — resolve contra as mensagens já carregadas nesta
// conversa; se não achar (fora da janela de 100, ou apagada), mostra um
// placeholder honesto em vez de fingir que tem o conteúdo.
function ReplyPreview({
  replyTarget,
  onJump,
}: {
  replyTarget: TextMessage | undefined;
  onJump: () => void;
}) {
  return (
    <button type="button" className="message-reply-preview" onClick={onJump} disabled={!replyTarget}>
      <ReplyIcon size={11} />
      {replyTarget ? (
        <>
          <strong>{replyTarget.senderName}</strong>
          <span>{replyTarget.text}</span>
        </>
      ) : (
        <em>Mensagem original não encontrada</em>
      )}
    </button>
  );
}

function HumanTextMessageRow({
  message,
  continued,
  session,
  canManageMessages,
  onOpenProfile,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onToggleReaction,
  onReply,
  onForward,
  replyTarget,
  onJumpToMessage,
  onTogglePin,
}: {
  message: TextMessage;
  continued: boolean;
  session: UserSession;
  canManageMessages: boolean;
  onOpenProfile: (userId: string, event: { currentTarget: HTMLElement }) => void;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (text: string) => Promise<void>;
  onDelete: () => void;
  onToggleReaction: (emoji: string, reacted: boolean) => void;
  onReply: () => void;
  onForward: () => void;
  replyTarget: TextMessage | undefined;
  onJumpToMessage: (messageId: string) => void;
  onTogglePin: () => void;
}) {
  const { avatarUrl, frame } = useTextAvatar(message.senderId, session);
  const initial = message.senderName.trim().charAt(0).toUpperCase() || '?';
  const isOwn = message.senderId === session.id;
  const [reactionPickerAnchor, setReactionPickerAnchor] = useState<DOMRect | null>(null);
  const copyFeedback = useCopyFeedback();
  const copyStatus = copyFeedback.statusFor(message.id);
  return (
    <article id={`message-${message.id}`} className={`message text-message ${continued ? 'continued' : ''} ${message.pinnedAt ? 'pinned' : ''}`}>
      <button
        type="button"
        className="message-avatar-trigger"
        onClick={(event) => onOpenProfile(message.senderId, event)}
        title={`Ver perfil de ${message.senderName}`}
      >
        <AvatarRing frame={frame}>
          <span className="text-message-avatar" aria-hidden="true">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : initial}
          </span>
        </AvatarRing>
      </button>
      <div>
        {message.replyToMessageId && (
          <ReplyPreview replyTarget={replyTarget} onJump={() => onJumpToMessage(message.replyToMessageId!)} />
        )}
        <header>
          <button type="button" className="message-name-trigger" onClick={(event) => onOpenProfile(message.senderId, event)}>
            {message.senderName}
          </button>
          <time dateTime={new Date(message.sentAt).toISOString()}>
            {new Date(message.sentAt).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
          {message.editedAt && <span className="message-edited-mark" title="Mensagem editada">(editado)</span>}
          {message.pinnedAt && <span className="message-pinned-mark" title="Mensagem fixada"><PinIcon size={11} /> fixada</span>}
        </header>
        {message.forwardedFromAuthorName && (
          <p className="message-forwarded-mark"><ForwardIcon size={11} /> Encaminhada de {message.forwardedFromAuthorName}</p>
        )}
        {isEditing ? (
          <MessageEditForm initialText={message.text} onSave={onSaveEdit} onCancel={onCancelEdit} />
        ) : (
          message.text && <p><MarkdownText text={message.text} /></p>
        )}
        {message.attachments?.length ? <MessageAttachments attachments={message.attachments} /> : null}
        <ReactionBar message={message} ownUserId={session.id} onToggle={onToggleReaction} />
      </div>
      {!isEditing && (
        <div className="message-hover-actions" role="toolbar" aria-label="Ações da mensagem">
          <button type="button" title="Responder" aria-label="Responder" onClick={onReply}>
            <ReplyIcon size={14} />
          </button>
          <button type="button" title="Encaminhar" aria-label="Encaminhar" onClick={onForward}>
            <ForwardIcon size={14} />
          </button>
          <button
            type="button"
            className={copyStatus === 'idle' ? undefined : `copy-${copyStatus}`}
            title={copyLabel(copyStatus)}
            aria-label={copyLabel(copyStatus)}
            onClick={() => void copyFeedback.copy(message.id, message.text)}
          >
            {copyStatus === 'copied' ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          </button>
          <div className="reaction-picker-anchor">
            <button
              type="button"
              title="Adicionar reação"
              aria-label="Adicionar reação"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setReactionPickerAnchor((current) => (current ? null : rect));
              }}
            >
              <SmileIcon size={14} />
            </button>
            {reactionPickerAnchor && (
              <Suspense fallback={null}>
                <EmojiPicker
                  anchorRect={reactionPickerAnchor}
                  onSelect={(emoji) => {
                    setReactionPickerAnchor(null);
                    onToggleReaction(emoji, false);
                  }}
                  onClose={() => setReactionPickerAnchor(null)}
                />
              </Suspense>
            )}
          </div>
          {canManageMessages && (
            <button
              type="button"
              title={message.pinnedAt ? 'Desafixar mensagem' : 'Fixar mensagem'}
              aria-label={message.pinnedAt ? 'Desafixar mensagem' : 'Fixar mensagem'}
              onClick={onTogglePin}
            >
              <PinIcon size={14} />
            </button>
          )}
          {isOwn && (
            <button type="button" title="Editar mensagem" aria-label="Editar mensagem" onClick={onStartEdit}>
              <EditIcon size={14} />
            </button>
          )}
          {(isOwn || canManageMessages) && (
            <button type="button" title="Apagar mensagem" aria-label="Apagar mensagem" onClick={onDelete}>
              <TrashIcon size={14} />
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function TextMessageRow(props: {
  message: TextMessage;
  continued: boolean;
  session: UserSession;
  canManageMessages: boolean;
  onOpenProfile: (userId: string, event: { currentTarget: HTMLElement }) => void;
  onMusicCommand: (command: string) => Promise<MusicCommandResponse>;
  onGameCommand: (command: string) => Promise<void>;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (text: string) => Promise<void>;
  onDelete: () => void;
  onToggleReaction: (emoji: string, reacted: boolean) => void;
  onReply: () => void;
  onForward: () => void;
  replyTarget: TextMessage | undefined;
  onJumpToMessage: (messageId: string) => void;
  onTogglePin: () => void;
}) {
  return props.message.senderType === 'BOT'
    ? <BotTextMessageRow message={props.message} onMusicCommand={props.onMusicCommand} />
    : props.message.senderType === 'GAME'
    ? <GameTextMessageRow message={props.message} viewerId={props.session.id} onGameCommand={props.onGameCommand} />
    : props.message.senderType === 'SYSTEM'
    ? <SystemTextMessageRow message={props.message} />
    : (
      <HumanTextMessageRow
        message={props.message}
        continued={props.continued}
        session={props.session}
        canManageMessages={props.canManageMessages}
        onOpenProfile={props.onOpenProfile}
        isEditing={props.isEditing}
        onStartEdit={props.onStartEdit}
        onCancelEdit={props.onCancelEdit}
        onSaveEdit={props.onSaveEdit}
        onDelete={props.onDelete}
        onToggleReaction={props.onToggleReaction}
        onReply={props.onReply}
        onForward={props.onForward}
        replyTarget={props.replyTarget}
        onJumpToMessage={props.onJumpToMessage}
        onTogglePin={props.onTogglePin}
      />
    );
}

function PinnedMessagesPanel({
  messages,
  canManageMessages,
  onJump,
  onUnpin,
}: {
  messages: TextMessage[];
  canManageMessages: boolean;
  onJump: (messageId: string) => void;
  onUnpin: (message: TextMessage) => void;
}) {
  return (
    <div className="channel-side-panel pinned-messages-panel" role="region" aria-label="Mensagens fixadas">
      <header><PinIcon size={13} /><strong>Mensagens fixadas</strong><span>{messages.length}</span></header>
      {messages.length === 0 ? (
        <p className="channel-side-panel-empty">Nenhuma mensagem fixada neste canal ainda.</p>
      ) : (
        <div className="channel-side-panel-list">
          {messages.map((message) => (
            <div className="pinned-message-row" key={message.id}>
              <button type="button" className="pinned-message-body" onClick={() => onJump(message.id)}>
                <strong>{message.senderName}</strong>
                <span>{message.text}</span>
              </button>
              {canManageMessages && (
                <button type="button" className="pinned-message-unpin" title="Desafixar" aria-label="Desafixar" onClick={() => onUnpin(message)}>
                  <CloseIcon size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageSearchPanel({
  serverId,
  channelId,
  onJump,
  loadedMessageIds,
}: {
  serverId: string;
  channelId: string;
  onJump: (messageId: string) => void;
  loadedMessageIds: Set<string>;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TextMessage[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < MESSAGE_SEARCH_QUERY_MIN_LENGTH || searching) return;
    setSearching(true);
    try {
      const { messages } = await api.searchMessages(serverId, channelId, trimmed);
      setResults(messages);
      setSearched(true);
    } catch {
      setResults([]);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="channel-side-panel message-search-panel" role="region" aria-label="Buscar mensagens">
      <form onSubmit={runSearch}>
        <SearchIcon size={13} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Buscar (mín. ${MESSAGE_SEARCH_QUERY_MIN_LENGTH} caracteres)`}
          autoFocus
        />
        <button type="submit" disabled={query.trim().length < MESSAGE_SEARCH_QUERY_MIN_LENGTH || searching}>
          {searching ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
      {searched && (
        results.length === 0 ? (
          <p className="channel-side-panel-empty">Nenhuma mensagem encontrada.</p>
        ) : (
          <div className="channel-side-panel-list">
            {results.map((message) => (
              <button
                type="button"
                key={message.id}
                className="search-result-row"
                onClick={() => loadedMessageIds.has(message.id) && onJump(message.id)}
                disabled={!loadedMessageIds.has(message.id)}
                title={loadedMessageIds.has(message.id) ? 'Ir para a mensagem' : 'Fora da janela carregada de mensagens recentes'}
              >
                <div className="search-result-meta">
                  <strong>{message.senderName}</strong>
                  <time>
                    {new Date(message.sentAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </time>
                </div>
                <span>{message.text}</span>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// O que precisa ser guardado pra mandar de novo uma mensagem que não saiu.
interface OutgoingText {
  text: string;
  replyToId: string | undefined;
  attachmentIds: string[];
  postAsSystem: boolean;
}

interface FailedTextSend extends OutgoingText {
  id: string;
  channelId: string;
}

export function TextChannelView({
  channel,
  session,
  member,
  messageStyle,
  voiceChannelId,
  onOpenProfile,
  onForward,
}: {
  channel: TextChannel;
  session: UserSession;
  member: ServerMember | null;
  messageStyle: MessageStyle;
  voiceChannelId: string | null;
  onOpenProfile: (userId: string, event: { currentTarget: HTMLElement }) => void;
  onForward: (message: TextMessage) => void;
}) {
  const [messages, setMessages] = useState<TextMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  // Mensagens que não saíram por falta de conexão (ficam até serem reenviadas ou descartadas).
  const [failedSends, setFailedSends] = useState<FailedTextSend[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const failedSequence = useRef(0);
  const [postAsSystem, setPostAsSystem] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<MusicCommandResponse | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<TextMessage | null>(null);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<TextMessage[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isTimedOut = Boolean(member?.timeoutUntil && member.timeoutUntil > Date.now());
  const canManageMessages = hasPermission(member?.permissions ?? 0, Permission.MANAGE_MESSAGES);

  async function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setAttachmentError('');
    const room = ATTACHMENT_MAX_PER_MESSAGE - pendingAttachments.length;
    if (files.length > room) {
      setAttachmentError(`Só dá pra anexar até ${ATTACHMENT_MAX_PER_MESSAGE} arquivos por mensagem.`);
    }
    const toUpload = files.slice(0, Math.max(room, 0));
    setUploading(true);
    try {
      for (const file of toUpload) {
        if (file.size > ATTACHMENT_MAX_SIZE_BYTES) {
          setAttachmentError(`"${file.name}" passa do limite de ${Math.floor(ATTACHMENT_MAX_SIZE_BYTES / 1024 / 1024)}MB.`);
          continue;
        }
        try {
          const { attachment } = await api.uploadAttachment(channel.serverId, channel.id, file);
          setPendingAttachments((current) => [...current, attachment]);
        } catch (uploadError) {
          setAttachmentError(uploadError instanceof Error ? uploadError.message : `Não foi possível enviar "${file.name}".`);
        }
      }
    } finally {
      setUploading(false);
    }
  }

  // Só destaca visualmente se a mensagem original estiver na janela já
  // carregada (até 100 mensagens) — sem isso, não há pra onde rolar.
  function jumpToMessage(messageId: string) {
    const element = document.getElementById(`message-${messageId}`);
    if (!element) return;
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    element.classList.add('message-jump-highlight');
    window.setTimeout(() => element.classList.remove('message-jump-highlight'), 1_500);
  }

  async function saveMessageEdit(messageId: string, text: string) {
    try {
      const { message } = await api.editTextMessage(channel.serverId, channel.id, messageId, text);
      setMessages((current) => applyIncomingMessage(current, message));
      setEditingMessageId(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível editar a mensagem.');
    }
  }

  async function deleteMessage(messageId: string) {
    if (!window.confirm('Apagar esta mensagem? Essa ação não pode ser desfeita.')) return;
    try {
      await api.deleteTextMessage(channel.serverId, channel.id, messageId);
      setMessages((current) => current.filter(({ id }) => id !== messageId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível apagar a mensagem.');
    }
  }

  // Aplica localmente na hora (sem esperar o eco do próprio WebSocket) pra
  // parecer instantâneo; o eco chega de qualquer forma e é idempotente.
  async function toggleReaction(messageId: string, emoji: string, reacted: boolean) {
    setMessages((current) => applyReactionChange(current, messageId, emoji, session.id, reacted ? 'remove' : 'add'));
    try {
      if (reacted) await api.removeReaction(channel.serverId, channel.id, messageId, emoji);
      else await api.addReaction(channel.serverId, channel.id, messageId, emoji);
    } catch {
      // Reverte o otimismo local — o próximo fetch/reconexão também corrigiria.
      setMessages((current) => applyReactionChange(current, messageId, emoji, session.id, reacted ? 'add' : 'remove'));
    }
  }

  async function togglePin(message: TextMessage) {
    try {
      if (message.pinnedAt) {
        await api.unpinMessage(channel.serverId, channel.id, message.id);
        const { pinnedAt: _pinnedAt, ...unpinned } = message;
        setMessages((current) => applyIncomingMessage(current, unpinned));
        setPinnedMessages((current) => current.filter(({ id }) => id !== message.id));
      } else {
        const { message: pinned } = await api.pinMessage(channel.serverId, channel.id, message.id);
        setMessages((current) => applyIncomingMessage(current, pinned));
        setPinnedMessages((current) => [pinned, ...current]);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível fixar/desafixar a mensagem.');
    }
  }

  function refreshPinnedMessages() {
    void api.getPinnedMessages(channel.serverId, channel.id).then(({ messages: pinned }) => setPinnedMessages(pinned)).catch(() => {
      // Painel simplesmente mostra a última lista conhecida.
    });
  }

  useEffect(() => {
    let active = true;
    let requestRunning = false;
    setMessages([]);
    setDraft('');
    setLoading(true);
    setError('');
    setFeedback(null);
    setEditingMessageId(null);
    setReplyingTo(null);
    setPinsOpen(false);
    setPinnedMessages([]);
    setSearchOpen(false);
    setPendingAttachments([]);
    setAttachmentError('');

    const refresh = async () => {
      if (requestRunning) return;
      requestRunning = true;
      try {
        const result = await api.getTextMessages(channel.serverId, channel.id);
        if (active) {
          setMessages(result.messages);
          setError('');
        }
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar as mensagens.');
        }
      } finally {
        requestRunning = false;
        if (active) setLoading(false);
      }
    };

    void refresh();
    // Sem poll: o WebSocket empurra criação/atualização/remoção em tempo
    // real (ver assinatura abaixo). Ao reconectar depois de ficar offline,
    // refaz esse fetch pra resincronizar qualquer coisa perdida no meio.
    const unsubscribeReconnect = onRealtimeConnect(() => void refresh());
    return () => {
      active = false;
      unsubscribeReconnect();
    };
  }, [channel.id]);

  useEffect(() => {
    if (pinsOpen) refreshPinnedMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinsOpen, channel.id]);

  useEffect(() => {
    return onRealtimeEvent((event) => {
      if (event.type === 'TEXT_MESSAGE_CREATE' || event.type === 'TEXT_MESSAGE_UPSERT') {
        if (event.channelId !== channel.id) return;
        setMessages((current) => applyIncomingMessage(current, event.message));
        window.requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
        setPinnedMessages((current) => {
          const wasPinned = current.some(({ id }) => id === event.message.id);
          if (event.message.pinnedAt) return applyIncomingMessage(current, event.message);
          return wasPinned ? current.filter(({ id }) => id !== event.message.id) : current;
        });
      } else if (event.type === 'TEXT_MESSAGE_DELETE') {
        if (event.channelId !== channel.id) return;
        setMessages((current) => current.filter(({ id }) => id !== event.messageId));
        setPinnedMessages((current) => current.filter(({ id }) => id !== event.messageId));
      } else if (event.type === 'TEXT_MESSAGE_REACTION_ADD' || event.type === 'TEXT_MESSAGE_REACTION_REMOVE') {
        if (event.channelId !== channel.id) return;
        const action = event.type === 'TEXT_MESSAGE_REACTION_ADD' ? 'add' : 'remove';
        setMessages((current) => applyReactionChange(current, event.messageId, event.emoji, event.userId, action));
      }
    });
  }, [channel.id]);

  useEffect(() => {
    if (!loading) endRef.current?.scrollIntoView({ block: 'end' });
  }, [channel.id, loading]);

  // Entrega uma mensagem (ou comando de música) e aplica o resultado na tela. Serve tanto
  // ao envio normal quanto ao "Tentar de novo" de uma mensagem que não saiu.
  async function deliverMessage(send: OutgoingText) {
    const result = await routeTextChannelInput({
      text: send.text,
      voiceChannelId,
      textChannelId: channel.id,
      sendMusicCommand: (roomId, commandText, textChannelId) =>
        api.sendMusicCommand(channel.serverId, roomId, commandText, textChannelId),
      sendTextMessage: async (messageText) =>
        (await api.sendTextMessage(channel.serverId, channel.id, messageText, send.replyToId, send.attachmentIds, send.postAsSystem)).message,
    });
    if (result.kind === 'text-message') {
      const { message } = result;
      setMessages((current) => applyIncomingMessage(current, message));
      window.requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
    } else if (result.response.textMessage) {
      const botMessage = result.response.textMessage;
      setMessages((current) => applyIncomingMessage(current, botMessage));
      window.requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
    } else if (result.response.removeTextMessage) {
      setMessages((current) => current.filter(({ senderType }) => senderType !== 'BOT'));
      setFeedback(result.response);
    } else {
      setFeedback(result.response);
    }
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && pendingAttachments.length === 0) || sending) return;
    setSending(true);
    setError('');
    setFeedback(null);
    const send: OutgoingText = {
      text,
      replyToId: replyingTo?.id,
      attachmentIds: pendingAttachments.map(({ id }) => id),
      postAsSystem,
    };
    try {
      await deliverMessage(send);
      setReplyingTo(null);
      setPendingAttachments([]);
      setDraft('');
      inputRef.current?.focus();
    } catch (requestError) {
      if (requestError instanceof NetworkError) {
        // Sem conexão: a mensagem sai do campo e fica no fim da conversa como "não enviada".
        failedSequence.current += 1;
        setFailedSends((current) => [...current, { ...send, id: `falha-${failedSequence.current}`, channelId: channel.id }]);
        setReplyingTo(null);
        setPendingAttachments([]);
        setDraft('');
        window.requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
      } else {
        setError(requestError instanceof Error ? requestError.message : 'Não foi possível enviar a mensagem.');
      }
    } finally {
      setSending(false);
    }
  }

  async function retryFailedSend(item: FailedTextSend) {
    if (retryingId) return;
    setRetryingId(item.id);
    setError('');
    try {
      await deliverMessage(item);
      setFailedSends((current) => current.filter(({ id }) => id !== item.id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <section className="text-channel-view" aria-label={`Canal de texto ${channel.name}`}>
      <div className="text-channel-toolbar">
        <button
          type="button"
          className={`icon-button ${pinsOpen ? 'selected' : ''}`}
          title="Mensagens fixadas"
          aria-label="Mensagens fixadas"
          onClick={() => {
            setPinsOpen((open) => !open);
            setSearchOpen(false);
          }}
        >
          <PinIcon size={15} />
        </button>
        <button
          type="button"
          className={`icon-button ${searchOpen ? 'selected' : ''}`}
          title="Buscar mensagens"
          aria-label="Buscar mensagens"
          onClick={() => {
            setSearchOpen((open) => !open);
            setPinsOpen(false);
          }}
        >
          <SearchIcon size={15} />
        </button>
      </div>
      {pinsOpen && (
        <PinnedMessagesPanel
          messages={pinnedMessages}
          canManageMessages={canManageMessages}
          onJump={(messageId) => {
            jumpToMessage(messageId);
            setPinsOpen(false);
          }}
          onUnpin={(message) => void togglePin(message)}
        />
      )}
      {searchOpen && <MessageSearchPanel serverId={channel.serverId} channelId={channel.id} onJump={jumpToMessage} loadedMessageIds={new Set(messages.map(({ id }) => id))} />}
      {error && <div className="error-banner" role="alert"><span>{error}</span></div>}
      {feedback && <div className="music-command-feedback" role="status"><span>{feedback.message}</span>{feedback.nowPlaying && <MusicCard card={feedback.nowPlaying} />}</div>}
      <div
        className={`messages text-channel-messages ${messageStyle === 'compact' ? 'compact' : ''} ${messageStyle === 'grouped' ? 'grouped' : ''}`}
        role="log"
        aria-live="polite"
        aria-busy={loading}
        aria-relevant="additions text"
      >
        {loading ? (
          <MessageSkeleton />
        ) : messages.length === 0 ? (
          <div className="text-channel-welcome">
            <span aria-hidden="true">#</span>
            <h2>Boas-vindas a #{channel.name}</h2>
            <p>Este é o começo deste canal. Envie a primeira mensagem.</p>
          </div>
        ) : messages.map((message, index) => {
          const previous = messages[index - 1];
          const continued =
            messageStyle === 'grouped' &&
            previous?.senderId === message.senderId &&
            message.sentAt - previous.sentAt < 5 * 60 * 1000;
          return (
            <TextMessageRow
              key={message.id}
              message={message}
              continued={continued}
              session={session}
              canManageMessages={canManageMessages}
              onOpenProfile={onOpenProfile}
              isEditing={editingMessageId === message.id}
              onStartEdit={() => setEditingMessageId(message.id)}
              onCancelEdit={() => setEditingMessageId(null)}
              onSaveEdit={(text) => saveMessageEdit(message.id, text)}
              onDelete={() => void deleteMessage(message.id)}
              onToggleReaction={(emoji, reacted) => void toggleReaction(message.id, emoji, reacted)}
              onReply={() => {
                setReplyingTo(message);
                inputRef.current?.focus();
              }}
              onForward={() => onForward(message)}
              replyTarget={message.replyToMessageId ? messages.find(({ id }) => id === message.replyToMessageId) : undefined}
              onJumpToMessage={jumpToMessage}
              onTogglePin={() => void togglePin(message)}
              onGameCommand={async (commandText) => {
                // Os botões do NexDex mandam o mesmo comando que a pessoa digitaria; o bot responde pelo tempo real.
                const { message: sent } = await api.sendTextMessage(channel.serverId, channel.id, commandText);
                setMessages((current) => applyIncomingMessage(current, sent));
              }}
              onMusicCommand={async (commandText) => {
                if (!voiceChannelId) {
                  throw new Error('Você precisa estar em um canal de voz para usar os controles do NexMusic.');
                }
                const response = await api.sendMusicCommand(channel.serverId, voiceChannelId, commandText, channel.id);
                if (response.removeTextMessage) {
                  setMessages((current) => current.filter(({ senderType }) => senderType !== 'BOT'));
                } else if (response.textMessage) {
                  setMessages((current) => applyIncomingMessage(current, response.textMessage!));
                }
                return response;
              }}
            />
          );
        })}
        <FailedMessages
          items={failedSends.filter(({ channelId }) => channelId === channel.id)}
          retryingId={retryingId}
          onRetry={(item) => void retryFailedSend(item)}
          onDiscard={(item) => setFailedSends((current) => current.filter(({ id }) => id !== item.id))}
        />
        <div ref={endRef} />
      </div>
      {replyingTo && (
        <div className="reply-composer-banner">
          <ReplyIcon size={13} />
          <span>Respondendo a <strong>{replyingTo.senderName}</strong></span>
          <button type="button" aria-label="Cancelar resposta" onClick={() => setReplyingTo(null)}>
            <CloseIcon size={13} />
          </button>
        </div>
      )}
      {isTimedOut && member?.timeoutUntil && (
        <div className="reply-composer-banner timeout-composer-banner">
          <span>
            Você está em timeout e não pode enviar mensagens até{' '}
            {new Date(member.timeoutUntil).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.
          </span>
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
              {isInlineImageAttachment(attachment) ? (
                <img src={attachment.url} alt="" />
              ) : (
                <FileIcon size={16} />
              )}
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
      <form className="text-channel-form" onSubmit={submitMessage}>
        <div className="text-channel-input-row">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => void handleFilesSelected(event)}
          />
          <button
            type="button"
            className="text-channel-attach-button"
            title="Anexar arquivo"
            aria-label="Anexar arquivo"
            disabled={isTimedOut || uploading || pendingAttachments.length >= ATTACHMENT_MAX_PER_MESSAGE}
            onClick={() => fileInputRef.current?.click()}
          >
            <AttachmentIcon size={17} />
          </button>
          <label className="sr-only" htmlFor="text-channel-message">Mensagem para #{channel.name}</label>
          <textarea
            ref={inputRef}
            id="text-channel-message"
            rows={1}
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            value={draft}
            disabled={isTimedOut}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={
              isTimedOut ? 'Você está em timeout'
                : uploading ? 'Enviando arquivo…'
                : postAsSystem ? `Publicar como o servidor em #${channel.name}`
                : `Conversar em #${channel.name}`
            }
          />
        </div>
        <div className="text-channel-form-meta">
          {canManageMessages && (
            <button type="button" className={`system-post-toggle ${postAsSystem ? 'active' : ''}`}
              title="Publicar como o servidor (aparece com o ícone e nome do servidor, selo APP)"
              aria-pressed={postAsSystem} onClick={() => setPostAsSystem((value) => !value)}>
              <SettingsIcon size={13} /> {postAsSystem ? 'Publicando como servidor' : 'Publicar como servidor'}
            </button>
          )}
          <span>{draft.length}/{CHAT_MESSAGE_MAX_LENGTH}</span>
          <button type="submit" disabled={isTimedOut || sending || uploading || (!draft.trim() && pendingAttachments.length === 0)}>
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </section>
  );
}

export function CreateTextChannelDialog({
  open,
  serverId,
  onClose,
  onTextCreated,
  onVoiceCreated,
  returnFocusRef,
  initialType = 'text',
  categoryName,
  categoryStaffOnly,
}: {
  open: boolean;
  serverId: string;
  onClose: () => void;
  onTextCreated: (channel: TextChannel) => void;
  onVoiceCreated: (channel: VoiceChannel) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  initialType?: 'text' | 'voice';
  categoryName?: string | null | undefined;
  categoryStaffOnly?: boolean | undefined;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channelType, setChannelType] = useState<'text' | 'voice'>(initialType);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) setChannelType(initialType);
  }, [open, initialType]);

  const close = useCallback(() => {
    onClose();
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  }, [onClose, returnFocusRef]);

  useEffect(() => {
    if (!open) return;
    nameInputRef.current?.focus();
    const overlay = overlayRef.current;
    const backgroundSiblings = Array.from(overlay?.parentElement?.children ?? [])
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay)
      .map((element) => ({ element, ariaHidden: element.getAttribute('aria-hidden') }));
    for (const { element } of backgroundSiblings) {
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      for (const { element, ariaHidden } of backgroundSiblings) {
        element.removeAttribute('inert');
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      }
    };
  }, [close, open, saving]);

  if (!open) return null;

  async function submitChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      if (channelType === 'text') {
        const { channel } = await api.createTextChannel(serverId, name, description);
        onTextCreated(channel);
      } else {
        const { channel } = await api.createVoiceChannel(serverId, name, description);
        onVoiceCreated(channel);
      }
      setName('');
      setDescription('');
      close();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível criar o canal.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={overlayRef} className="dialog-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) close();
    }}>
      <form
        ref={dialogRef}
        className="channel-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onSubmit={submitChannel}
      >
        <header>
          <div>
            <h2 id={titleId}>Criar canal</h2>
            <p id={descriptionId}>
              {categoryName
                ? <>em {categoryStaffOnly && '🔒 '}<strong>{categoryName}</strong></>
                : 'Configure o novo espaço do seu servidor.'}
            </p>
          </div>
          <button type="button" onClick={close} disabled={saving} aria-label="Fechar">
            <CloseIcon size={18} />
          </button>
        </header>
        <label>Tipo de canal</label>
        <div className="channel-type-grid" aria-label="Tipo de canal">
          <button type="button" className={`channel-type-card ${channelType === 'text' ? 'selected' : ''}`}
            onClick={() => setChannelType('text')}>
            <MessageIcon size={21} /><span><strong>Texto</strong><small>Envie mensagens, imagens e arquivos</small></span>
            {channelType === 'text' && <i>✓</i>}
          </button>
          <button type="button" className={`channel-type-card ${channelType === 'voice' ? 'selected' : ''}`}
            onClick={() => setChannelType('voice')}>
            <VoiceIcon size={21} /><span><strong>Voz</strong><small>Converse por voz e vídeo</small></span>
            {channelType === 'voice' && <i>✓</i>}
          </button>
        </div>
        <label htmlFor="channel-name">Nome do canal</label>
        <div className="channel-name-field">
          {channelType === 'text' ? <span aria-hidden="true">#</span> : <VoiceIcon size={14} />}
          <input
            ref={nameInputRef}
            id="channel-name"
            maxLength={TEXT_CHANNEL_NAME_MAX_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="novo-canal"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            required
          />
        </div>
        <label htmlFor="channel-description">Descrição <span>(opcional)</span></label>
        <input
          id="channel-description"
          maxLength={TEXT_CHANNEL_DESCRIPTION_MAX_LENGTH}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Sobre o que é este canal?"
        />
        {error && <p id={errorId} className="form-error" role="alert">{error}</p>}
        <footer>
          <button type="button" className="dialog-cancel" onClick={close} disabled={saving}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving || !name.trim()}>
            {saving ? 'Criando…' : 'Criar canal'}
          </button>
        </footer>
      </form>
    </div>
  );
}
