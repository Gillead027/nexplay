// Cronômetro das chamadas — a regra pura (sem banco), separada para poder ser testada. O uso com o banco está em callSessions.ts.
// A chamada COMEÇA quando a primeira pessoa (de verdade, não o bot de música) entra numa sala vazia e TERMINA quando a última sai;
// se alguém entrar de novo depois disso, é outra chamada, com o cronômetro do zero.

/**
 * Decide o começo da chamada. `stored` é o que estava guardado, `humanJoinedAtMs` a hora de entrada de cada pessoa que está na
 * sala agora (só humanos). Devolve o começo (ms) ou null se não há chamada — e `persist` diz se o valor precisa ser gravado.
 */
export function resolveCallStart(
  stored: number | null,
  humanJoinedAtMs: readonly number[],
  now: number,
): { startedAt: number | null; persist: boolean } {
  if (humanJoinedAtMs.length === 0) return { startedAt: null, persist: false };
  if (stored !== null) return { startedAt: stored, persist: false };
  // Sem registro (primeira pessoa acabou de entrar, ou a API reiniciou no meio da chamada): a entrada mais antiga de quem está
  // aí é o melhor palpite, e nunca no futuro.
  const earliest = Math.min(...humanJoinedAtMs.filter((value) => value > 0));
  const startedAt = Number.isFinite(earliest) ? Math.min(earliest, now) : now;
  return { startedAt, persist: true };
}
