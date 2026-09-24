import type { RoomSummary } from '@nexplay/shared';

// Cronômetro das chamadas nos canais de voz. O servidor manda há quanto tempo a chamada está ativa (callElapsedMs, medido no
// relógio DELE); aqui isso vira o instante de começo no relógio deste computador, para o cronômetro correr sozinho sem
// depender de os dois relógios estarem certos.

/** Sala com o começo da chamada já convertido para o relógio local (null = sem chamada). */
export type RoomView = RoomSummary & { callStartedAtLocal?: number | null };

/** Marca a sala recebida agora: o começo local é "agora menos o tempo que o servidor disse". */
export function stampRoom(room: RoomSummary, receivedAt: number = Date.now()): RoomView {
  return { ...room, callStartedAtLocal: typeof room.callElapsedMs === 'number' ? receivedAt - room.callElapsedMs : null };
}

/** Quanto tempo a chamada dura, em texto: "0:45", "12:03" ou "1:02:15" (a partir de 1 hora). */
export function formatCallDuration(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}
