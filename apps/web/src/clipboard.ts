// Copia texto pra área de transferência e diz se conseguiu.
//
// `navigator.clipboard.writeText` é o caminho certo, mas no app desktop o
// Electron nega a permissão de escrita (o processo principal só libera mídia,
// tela cheia, captura de tela e alto-falante), e a chamada rejeita com
// NotAllowedError mesmo com a janela focada. Como o desktop carrega o site de
// produção, o plano B abaixo (`execCommand('copy')` num textarea temporário, que
// não depende dessa permissão) conserta a cópia também nas versões já instaladas.
export async function copyText(text: string): Promise<boolean> {
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
