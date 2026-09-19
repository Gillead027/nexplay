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
