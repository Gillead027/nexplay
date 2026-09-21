// Permissões que a janela principal pode receber. Usada pelo verificador e pelo
// pedido de permissão do Electron, que antes repetiam a mesma lista à mão.
//
// `clipboard-sanitized-write` é o que o Chromium consulta em
// navigator.clipboard.writeText. Sem ela, copiar texto falhava com
// NotAllowedError no app desktop. Só a escrita entra: leitura da área de
// transferência (`clipboard-read`), notificações e qualquer outra permissão
// continuam negadas.
const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set([
  'media',
  'fullscreen',
  'automatic-fullscreen',
  'display-capture',
  'speaker-selection',
  'clipboard-sanitized-write',
]);

export function isAllowedPermission(permission: string): boolean {
  return ALLOWED_PERMISSIONS.has(permission);
}

const MAX_EXTERNAL_URL_LENGTH = 4_096;

// Único link do protocolo nexplay:// que o app entende: nexplay://convite/<CÓDIGO>. O sistema
// entrega o que a pessoa clicou (qualquer site pode montar um link nexplay://), então só o que
// bate exatamente com esse formato passa e é reescrito, nunca repassado como veio.
const DEEP_LINK_INVITE = /^nexplay:\/\/convite\/([A-Za-z0-9_-]{4,64})\/?$/;

export function parseDeepLink(candidate: string): string | null {
  if (typeof candidate !== 'string' || candidate.length > 128) return null;
  const match = DEEP_LINK_INVITE.exec(candidate.trim());
  return match ? `nexplay://convite/${match[1]}` : null;
}

// Procura um link válido nos argumentos com que o app foi aberto (o Windows entrega o link
// como um argumento da linha de comando).
export function findDeepLink(argv: readonly string[]): string | null {
  for (const arg of argv) {
    const link = parseDeepLink(arg);
    if (link) return link;
  }
  return null;
}

// Devolve a URL normalizada se for um link web que pode ir pro navegador do
// sistema, ou null. Só http e https: nunca file:, javascript:, ms-settings: nem
// esquemas de aplicativo, que `shell.openExternal` executaria de verdade. Também
// recusa endereço com usuário e senha embutidos (usado em golpes de link
// disfarçado) e sem host.
export function externalWebUrl(candidate: string): string | null {
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > MAX_EXTERNAL_URL_LENGTH) return null;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname) return null;
  if (parsed.username || parsed.password) return null;
  return parsed.href;
}
