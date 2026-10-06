import { native } from './native';

// Copia texto pra área de transferência e diz se conseguiu.
//
// No app desktop, a ponte nativa (`native().clipboard.copy`) é o caminho 100%
// confiável: escreve pela área de transferência do Electron no processo
// principal, sem depender da permissão de clipboard da web (que o Electron nega,
// rejeitando `navigator.clipboard.writeText` com NotAllowedError). Em clientes
// desktop antigos (sem a ponte nova) e na web pura ela devolve false/ausente, e
// seguem os caminhos padrão: `navigator.clipboard` e o plano B `execCommand`.
export async function copyText(text: string): Promise<boolean> {
  try {
    const shell = native();
    if (shell && (await shell.clipboard.copy(text))) return true;
  } catch {
    // Ponte indisponível ou falhou: segue para os caminhos web abaixo.
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permissão negada ou documento sem foco: tenta o plano B.
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  // Fora da tela e sem rolar a página até ele.
  field.style.position = 'fixed';
  field.style.top = '0';
  field.style.left = '-9999px';
  field.style.opacity = '0';

  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.body.appendChild(field);
  let copied = false;
  try {
    field.focus();
    field.select();
    field.setSelectionRange(0, text.length);
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(field);
    previouslyFocused?.focus();
  }
  return copied;
}
