import type { RealtimeEvent } from '@nexplay/shared';

// "Fulano está digitando…": o servidor avisa a cada TYPING_START e o aviso vale por poucos segundos; a mensagem enviada
// encerra na hora o "digitando" de quem a enviou.

export const TYPING_VISIBLE_MS = 8_000;
// O cliente só avisa que está digitando no máximo a cada tanto, por conversa.
export const TYPING_SEND_INTERVAL_MS = 3_000;

export type TypingScope = { kind: 'channel'; serverId: string; channelId: string } | { kind: 'dm'; dmChannelId: string };

export interface Typer {
  userId: string;
  name: string;
  until: number;
}

/** Aplica um evento em tempo real à lista de quem está digitando nesta conversa. Devolve a mesma lista quando nada muda. */
export function applyTypingEvent(typers: readonly Typer[], event: RealtimeEvent, scope: TypingScope, ownId: string, now: number): readonly Typer[] {
  if (scope.kind === 'channel') {
    if (event.type === 'TYPING_START' && event.serverId === scope.serverId && event.channelId === scope.channelId) {
      return addTyper(typers, event.userId, event.displayName, ownId, now);
    }
    if ((event.type === 'TEXT_MESSAGE_CREATE' || event.type === 'TEXT_MESSAGE_UPSERT') && event.channelId === scope.channelId) {
      return removeTyper(typers, event.message.senderId);
    }
    return typers;
  }
  if (event.type === 'DM_TYPING_START' && event.dmChannelId === scope.dmChannelId) {
    return addTyper(typers, event.userId, event.displayName, ownId, now);
  }
  if ((event.type === 'DM_MESSAGE_CREATE' || event.type === 'DM_MESSAGE_UPSERT') && event.dmChannelId === scope.dmChannelId) {
    return removeTyper(typers, event.message.senderId);
  }
  return typers;
}

function addTyper(typers: readonly Typer[], userId: string, name: string, ownId: string, now: number): readonly Typer[] {
  if (userId === ownId) return typers;
  const until = now + TYPING_VISIBLE_MS;
  const others = typers.filter((typer) => typer.userId !== userId && typer.until > now);
  return [...others, { userId, name, until }];
}

function removeTyper(typers: readonly Typer[], userId: string): readonly Typer[] {
  return typers.some((typer) => typer.userId === userId) ? typers.filter((typer) => typer.userId !== userId) : typers;
}

export function activeTypers(typers: readonly Typer[], now: number): readonly Typer[] {
  return typers.filter((typer) => typer.until > now);
}

/** O texto do aviso, em português: "A está digitando…", "A e B estão digitando…", "Várias pessoas estão digitando…". */
export function typingLabel(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} está digitando…`;
  if (names.length === 2) return `${names[0]} e ${names[1]} estão digitando…`;
  if (names.length === 3) return `${names[0]}, ${names[1]} e ${names[2]} estão digitando…`;
  return 'Várias pessoas estão digitando…';
}

/** Avisa que está digitando só quando há texto, passou o intervalo desde o último aviso e a pessoa não está invisível. */
export function shouldSendTyping(text: string, lastSentAt: number, now: number, invisible: boolean): boolean {
  if (invisible || text.trim().length === 0) return false;
  return now - lastSentAt >= TYPING_SEND_INTERVAL_MS;
}
