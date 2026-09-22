import { useEffect, useRef } from 'react';
import type { NotificationMode, UserSession } from '@nexplay/shared';
import { getOutputVolume } from './appearancePrefs';
import { mentionsUser } from './mentions';
import { getNotificationPrefs } from './notificationPrefs';
import { NOTIFICATION_SOUND_COOLDOWN_MS, decideNotificationSound } from './notificationSound';
import { onRealtimeEvent } from './realtime';
import { playMentionSound, playMessageSound } from './sounds';

interface NotificationContext {
  session: UserSession;
  // O canal de texto ou a conversa direta que a pessoa está vendo agora (a janela precisa estar em foco).
  viewingChannelId: string | null;
  viewingDmChannelId: string | null;
  modeFor: (serverId: string, channelId: string) => NotificationMode;
}

const windowIsActive = (): boolean => document.visibilityState === 'visible' && document.hasFocus();

// Toca o som de mensagem nova ou de menção, conforme as regras de notificationSound.ts.
export function useNotificationSounds(context: NotificationContext): void {
  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  });

  useEffect(() => {
    let lastPlayedAt = 0;
    const play = (kind: 'message' | 'mention' | null) => {
      if (!kind) return;
      const now = Date.now();
      if (now - lastPlayedAt < NOTIFICATION_SOUND_COOLDOWN_MS) return;
      lastPlayedAt = now;
      const volume = getOutputVolume();
      if (kind === 'mention') playMentionSound(volume);
      else playMessageSound(volume);
    };

    return onRealtimeEvent((event) => {
      const { session, viewingChannelId, viewingDmChannelId, modeFor } = contextRef.current;
      if (event.type === 'TEXT_MESSAGE_CREATE') {
        const message = event.message;
        // Só mensagens de gente: respostas do bot de música e do NexDex, avisos do servidor e as próprias não tocam.
        if (message.senderType !== 'HUMAN' || message.senderId === session.id) return;
        play(
          decideNotificationSound({
            source: 'channel',
            mention: mentionsUser(message.text, session.displayName),
            viewing: viewingChannelId === event.channelId && windowIsActive(),
            mode: modeFor(event.serverId, event.channelId),
            status: session.presenceStatus,
            prefs: getNotificationPrefs(),
          }),
        );
      } else if (event.type === 'DM_MESSAGE_CREATE') {
        if (event.message.senderId === session.id) return;
        play(
          decideNotificationSound({
            source: 'dm',
            mention: mentionsUser(event.message.text, session.displayName),
            viewing: viewingDmChannelId === event.dmChannelId && windowIsActive(),
            mode: 'all',
            status: session.presenceStatus,
            prefs: getNotificationPrefs(),
          }),
        );
      }
    });
  }, []);
}
