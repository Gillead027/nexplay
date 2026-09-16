import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function prepareYtDlpCookies(path = ''): { args: string[]; cleanup: () => void } {
  if (!path) return { args: [], cleanup: () => {} };
  const directory = mkdtempSync(join(tmpdir(), 'sausimusic-cookies-'));
  try {
    const destination = join(directory, 'cookies.txt');
    copyFileSync(path, destination);
    return { args: ['--cookies', destination], cleanup: () => rmSync(directory, { recursive: true, force: true }) };
  } catch {
    rmSync(directory, { recursive: true, force: true });
    throw new Error('Não foi possível ler a autenticação configurada do YouTube.');
  }
}

export function ytDlpError(stderr: string): Error {
  if (/confirm you.re not a bot|cookies are no longer valid|login required|sign in/i.test(stderr)) {
    return new Error('O YouTube exige autenticação nesta conexão. Os cookies da conta precisam ser atualizados no servidor.');
  }
  return new Error('Não foi possível obter esta faixa do YouTube. Ela pode estar indisponível ou restrita nesta região.');
}
