// Rebrand Sausixudos/Gillecord → NexPlay: as chaves de localStorage usadas
// pelo app trocaram do prefixo 'gc:' (GilleCord) pra 'np:' (NexPlay). Migração
// não-destrutiva de uma via só — copia o valor da chave antiga pra nova (se a
// nova ainda não existir) e mantém a antiga intacta, pra preferência de
// usuário (tema, zoom, volume etc.) sobreviver ao rebrand mesmo se algo aqui
// falhar. Chamada uma única vez, antes de qualquer módulo ler suas próprias
// chaves 'np:*' (ver main.tsx).
const LEGACY_KEY_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['gc:theme', 'np:theme'],
  ['gc:density', 'np:density'],
  ['gc:perf-mode', 'np:perf-mode'],
  ['gc:chat-font-step', 'np:chat-font-step'],
  ['gc:message-spacing-step', 'np:message-spacing-step'],
  ['gc:ui-zoom-step', 'np:ui-zoom-step'],
  ['gc:ui-accent', 'np:ui-accent'],
  ['gc:ui-accent-enabled', 'np:ui-accent-enabled'],
  ['gc:output-volume', 'np:output-volume'],
  ['gc:soundboard-volume', 'np:soundboard-volume'],
  ['gc:message-style', 'np:message-style'],
  ['gc:input-mode', 'np:input-mode'],
  ['gc:ptt-key', 'np:ptt-key'],
  ['gc:noise-suppression', 'np:noise-suppression'],
  ['gc:echo-cancellation', 'np:echo-cancellation'],
  ['gc:auto-gain', 'np:auto-gain'],
  ['gc:mic-profile', 'np:mic-profile'],
  ['gc:auto-sensitivity', 'np:auto-sensitivity'],
  ['gc:input-sensitivity', 'np:input-sensitivity'],
];

export function migrateLegacyStorageKeys(): void {
  try {
    for (const [oldKey, newKey] of LEGACY_KEY_PAIRS) {
      if (localStorage.getItem(newKey) !== null) continue;
      const oldValue = localStorage.getItem(oldKey);
      if (oldValue !== null) localStorage.setItem(newKey, oldValue);
    }
  } catch {
    // localStorage pode estar indisponível (modo privado, storage bloqueado)
    // — segue com os defaults de cada módulo, sem travar o boot por causa disso.
  }
}
