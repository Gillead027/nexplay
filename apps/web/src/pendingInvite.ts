const STORAGE_KEY = 'np:pending-invite';

// Avisa a tela que chegou um convite novo enquanto ela já está aberta (link nexplay:// entregue
// pelo app desktop). Quem está logado o usa na hora; quem não está, o usa depois de entrar.
export const PENDING_INVITE_EVENT = 'np:pending-invite';

// nexplay://convite/<CÓDIGO>, o link que o app desktop entrega ao clicar num convite fora dele.
export function extractDeepLinkInvite(url: string): string | null {
  const match = /^nexplay:\/\/convite\/([A-Za-z0-9_-]{4,64})\/?$/.exec(url.trim());
  return match?.[1] ?? null;
}

// Link que abre o app desktop já instalado (a tela de entrada oferece no navegador).
export function deepLinkUrl(code: string): string {
  return `nexplay://convite/${encodeURIComponent(code)}`;
}

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
