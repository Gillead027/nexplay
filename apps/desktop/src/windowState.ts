// Estado da janela principal (tamanho, posição, maximizado), guardado num
// arquivo na pasta de dados do app para o NexPlay reabrir como foi deixado —
// como o Discord faz. Diferente de `settings.ts` (preferências que a pessoa
// escolhe), isto é estado transitório da janela, salvo sozinho.
//
// Este módulo não usa o Electron de propósito: só decide o que é um estado
// válido, para poder ser testado. O clamp à área visível da tela (monitor que
// sumiu) fica no `main.ts`, onde o `screen` do Electron está disponível.

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

export const MIN_WINDOW_WIDTH = 1280;
export const MIN_WINDOW_HEIGHT = 720;

export const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1440,
  height: 900,
  maximized: false,
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Lê o estado guardado; qualquer coisa fora do esperado cai no padrão. */
export function parseWindowState(raw: string | null | undefined): WindowState {
  if (!raw) return { ...DEFAULT_WINDOW_STATE };
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof WindowState, unknown>> | null;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_WINDOW_STATE };

    const width = isFiniteNumber(parsed.width) ? Math.max(MIN_WINDOW_WIDTH, Math.round(parsed.width)) : DEFAULT_WINDOW_STATE.width;
    const height = isFiniteNumber(parsed.height) ? Math.max(MIN_WINDOW_HEIGHT, Math.round(parsed.height)) : DEFAULT_WINDOW_STATE.height;
    const maximized = typeof parsed.maximized === 'boolean' ? parsed.maximized : false;

    const state: WindowState = { width, height, maximized };
    // x/y só valem juntos (um canto); se qualquer um faltar ou for inválido, abre centralizado.
    if (isFiniteNumber(parsed.x) && isFiniteNumber(parsed.y)) {
      state.x = Math.round(parsed.x);
      state.y = Math.round(parsed.y);
    }
    return state;
  } catch {
    return { ...DEFAULT_WINDOW_STATE };
  }
}

export function serializeWindowState(state: WindowState): string {
  const clean: WindowState = {
    width: Math.max(MIN_WINDOW_WIDTH, Math.round(state.width)),
    height: Math.max(MIN_WINDOW_HEIGHT, Math.round(state.height)),
    maximized: Boolean(state.maximized),
  };
  if (isFiniteNumber(state.x) && isFiniteNumber(state.y)) {
    clean.x = Math.round(state.x);
    clean.y = Math.round(state.y);
  }
  return JSON.stringify(clean);
}

/**
 * Um retângulo salvo num monitor que não existe mais (desconectado, resolução
 * trocada) abriria a janela fora da tela. Dado o retângulo e as áreas úteis dos
 * monitores atuais, diz se o canto escolhido ainda está visível o suficiente.
 * `visibleMargin` é quanto da janela precisa estar dentro de algum monitor.
 */
export function isPositionVisible(
  bounds: { x: number; y: number; width: number; height: number },
  displays: readonly { x: number; y: number; width: number; height: number }[],
  visibleMargin = 80,
): boolean {
  return displays.some((d) => {
    const overlapX = Math.min(bounds.x + bounds.width, d.x + d.width) - Math.max(bounds.x, d.x);
    const overlapY = Math.min(bounds.y + bounds.height, d.y + d.height) - Math.max(bounds.y, d.y);
    return overlapX >= visibleMargin && overlapY >= visibleMargin;
  });
}
