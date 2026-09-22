import { parseNotificationPrefs, type NotificationSoundPrefs } from './notificationSound';

const KEY = 'np:notification-sounds';

// Guardado neste dispositivo (como as outras preferências de som): cada aparelho decide se toca.
export function getNotificationPrefs(): NotificationSoundPrefs {
  try {
    return parseNotificationPrefs(localStorage.getItem(KEY));
  } catch {
    return parseNotificationPrefs(null);
  }
}

export function setNotificationPrefs(prefs: NotificationSoundPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // sem armazenamento (janela anônima, por exemplo): a escolha vale só até fechar
  }
}
