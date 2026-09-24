import { db } from './db.js';
import { resolveCallStart } from './callStart.js';

// Cronômetro das chamadas: "há quanto tempo esta call está ativa". A chamada COMEÇA quando a primeira pessoa (de verdade, não o bot
// de música) entra numa sala vazia e TERMINA quando a última sai; se alguém entrar de novo depois disso, é outra chamada, com o
// cronômetro do zero. O começo fica guardado no banco (sobrevive a reinício da API) e é reconciliado com o que o LiveKit diz sobre
// quem está na sala agora, então nunca fica uma chamada "fantasma" contando depois de todo mundo ter saído.

const selectStartStatement = db.prepare('SELECT started_at FROM voice_call_sessions WHERE channel_id = ?');
const upsertStartStatement = db.prepare(
  'INSERT INTO voice_call_sessions (channel_id, started_at) VALUES (?, ?) ON CONFLICT(channel_id) DO UPDATE SET started_at = excluded.started_at',
);
const deleteStartStatement = db.prepare('DELETE FROM voice_call_sessions WHERE channel_id = ?');

/** Reconcilia e devolve há quanto tempo (ms) a chamada do canal está ativa, ou null se não há chamada agora. */
export function callElapsedMs(channelId: string, humanJoinedAtMs: readonly number[], now: number = Date.now()): number | null {
  const row = selectStartStatement.get(channelId) as { started_at: number } | undefined;
  const { startedAt, persist } = resolveCallStart(row?.started_at ?? null, humanJoinedAtMs, now);
  if (startedAt === null) {
    if (row) deleteStartStatement.run(channelId);
    return null;
  }
  if (persist) upsertStartStatement.run(channelId, startedAt);
  return Math.max(0, now - startedAt);
}

/** A sala acabou (room_finished do LiveKit): a chamada terminou. */
export function endCall(channelId: string): void {
  deleteStartStatement.run(channelId);
}
