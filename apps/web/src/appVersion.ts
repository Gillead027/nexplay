// Detecção de versão nova do app. Cada publicação gera um script principal com nome novo (/assets/index-<hash>.js) e a
// página inicial nunca fica em cache; então basta comparar o script que está rodando com o que a página inicial aponta agora.

// O endereço do script principal numa página HTML (null se a página não tiver um).
export function entryScriptOf(html: string): string | null {
  for (const tag of html.match(/<script\b[^>]*>/g) ?? []) {
    const source = /\bsrc="([^"]*\/assets\/index-[\w-]+\.js)"/.exec(tag)?.[1];
    if (source) return new URL(source, 'http://app.local').pathname;
  }
  return null;
}

// O script principal que está rodando agora. Em desenvolvimento (Vite) não há arquivo com hash: null, e a checagem não roda.
export function runningEntryScript(doc: Document = document): string | null {
  const element = doc.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  const source = element?.getAttribute('src');
  return source ? new URL(source, 'http://app.local').pathname : null;
}

export function isNewVersion(running: string | null, latest: string | null, dismissedFor: string | null): boolean {
  return running !== null && latest !== null && latest !== running && latest !== dismissedFor;
}
