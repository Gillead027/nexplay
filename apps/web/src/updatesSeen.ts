// "NOVO" no canal "atualizações": guarda, neste aparelho, até quando a pessoa já viu as novidades de cada canal.
// Só localStorage (é um lembrete de tela, não um dado da conta), sempre dentro de try/catch.

const STORAGE_KEY = 'nexplay.updatesSeen';

export function parseUpdatesSeen(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const seen: Record<string, number> = {};
    for (const [channelId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) seen[channelId] = value;
    }
    return seen;
  } catch {
    return {};
  }
}

export function readUpdatesSeen(): Record<string, number> {
  try {
    return parseUpdatesSeen(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

export function saveUpdatesSeen(seen: Record<string, number>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // Sem armazenamento (janela privada, cota cheia): o "NOVO" só volta a aparecer na próxima abertura.
  }
}

// Há novidade que a pessoa ainda não viu? (latestAt = quando a última foi publicada no canal.)
export function hasUnreadUpdates(latestAt: number | undefined, seenAt: number | undefined): boolean {
  return latestAt !== undefined && latestAt > (seenAt ?? 0);
}
