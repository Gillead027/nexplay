import type { NotificationMode, PresenceStatus } from '@nexplay/shared';

// Quando uma mensagem nova toca um som: só de outra pessoa, nunca no canal que a pessoa está olhando com a janela em foco, nunca
// no "Não perturbe", e respeitando o modo de notificação do canal (todas, só menções, nenhuma) e os interruptores de
// Configurações > Notificações.

export interface NotificationSoundPrefs {
  messages: boolean;
  mentions: boolean;
}

export type NotificationSoundKind = 'message' | 'mention';

export interface NotificationInput {
  // 'channel' = canal de servidor; 'dm' = conversa direta (toda mensagem direta chama, como no Discord).
  source: 'channel' | 'dm';
  mention: boolean;
  // A pessoa está com essa conversa aberta e a janela em foco.
  viewing: boolean;
  mode: NotificationMode;
  status: PresenceStatus;
  prefs: NotificationSoundPrefs;
}

export function decideNotificationSound(input: NotificationInput): NotificationSoundKind | null {
  if (input.status === 'dnd' || input.viewing) return null;
  if (input.source === 'dm') return input.prefs.messages ? 'message' : input.mention && input.prefs.mentions ? 'mention' : null;
  if (input.mode === 'none') return null;
  if (input.mention && input.prefs.mentions) return 'mention';
  if (input.mode === 'all' && input.prefs.messages) return 'message';
  return null;
}

/** Ler as preferências guardadas, com tudo ligado por padrão e tolerando lixo no armazenamento. */
export function parseNotificationPrefs(raw: string | null): NotificationSoundPrefs {
  const defaults: NotificationSoundPrefs = { messages: true, mentions: true };
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationSoundPrefs> | null;
    return {
      messages: typeof parsed?.messages === 'boolean' ? parsed.messages : defaults.messages,
      mentions: typeof parsed?.mentions === 'boolean' ? parsed.mentions : defaults.mentions,
    };
  } catch {
    return defaults;
  }
}

// Vários avisos quase juntos (uma rajada de mensagens) tocam um som só.
export const NOTIFICATION_SOUND_COOLDOWN_MS = 900;
