// Otimização visual do app (Configurações > Aparência): três níveis, do mais bonito ao mais leve. "Leve" aqui é o nome do
// nível — o de MENOS otimização (tudo ligado); "Completo" é o de MAIS otimização (o mais leve para o computador rodar).
// Cada nível liga o atributo `data-perf` na raiz do documento, e as regras que ele ativa vivem no CSS (styles.css e
// design.css), lidas por seletor `[data-perf="..."]` — este arquivo só decide QUAL nível vale e guarda a escolha.
export type PerfMode = 'leve' | 'moderado' | 'completo';
export const PERF_MODES: readonly PerfMode[] = ['leve', 'moderado', 'completo'];

const KEY = 'np:perf-mode';
// Nomes antigos (dois níveis, antes deste recurso ganhar o nível "moderado"): 'full' era tudo ligado (agora "leve"),
// 'lite' era tudo desligado (agora "completo"). Migra sozinho, sem a pessoa perceber a troca de nome.
const LEGACY_ALIASES: Record<string, PerfMode> = { full: 'leve', lite: 'completo' };

function normalize(value: string | null): PerfMode {
  if (value === 'leve' || value === 'moderado' || value === 'completo') return value;
  const alias = value ? LEGACY_ALIASES[value] : undefined;
  return alias ?? 'leve';
}

export function getPerfMode(): PerfMode {
  return normalize(localStorage.getItem(KEY));
}

export function applyPerfMode(mode: PerfMode): void {
  document.documentElement.setAttribute('data-perf', mode);
}

export function setPerfMode(mode: PerfMode): void {
  localStorage.setItem(KEY, mode);
  applyPerfMode(mode);
}

export function bootPerfMode(): void {
  applyPerfMode(getPerfMode());
}

export const PERF_MODE_LABELS: Record<PerfMode, string> = {
  leve: 'Leve',
  moderado: 'Moderado',
  completo: 'Completo',
};

export const PERF_MODE_HINTS: Record<PerfMode, string> = {
  leve: 'Visual completo: todas as animações, desfoques e transições ligados. Para computadores mais fortes.',
  moderado: 'Um meio-termo: desliga desfoques e animações decorativas (fundo, brilhos), mas mantém as transições do dia a dia.',
  completo: 'O mais leve para o computador rodar: sem animações, sem desfoque, sem GIF tocando sozinho e sombras reduzidas a bordas simples. Continua funcional e bonito, só sem o que pesa mais.',
};
