const STORAGE_KEY = 'np:pending-invite';

// Link de convite: https://<site>/convite/<CÓDIGO>. Quem abre o link sem estar logado tem o
// código guardado até entrar (ou criar a conta); depois entra no servidor sozinho.
export function extractInviteCode(pathname: string): string | null {
  const match = /^\/convite\/([A-Za-z0-9_-]{4,64})\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

export function inviteUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/convite/${encodeURIComponent(code)}`;
}

export function savePendingInvite(code: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Sem sessionStorage (janela privada bloqueada): o link continua servindo, só não sobrevive a um recarregamento.
  }
}

export function peekPendingInvite(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function takePendingInvite(): string | null {
  const code = peekPendingInvite();
  if (code === null) return null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Não conseguiu limpar: pior caso, tenta entrar de novo (o servidor responde "já é membro").
  }
  return code;
}
