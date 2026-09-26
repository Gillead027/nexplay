import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ACCENT_COLORS } from '@nexplay/shared';

// Ajuda dos testes de integração: sobe a API de verdade (processo filho) num banco temporário. Diferente do
// `withApi` que cada teste antigo repete, aqui a pasta do banco é de quem chama, então dá para desligar a API e
// subir de novo sobre o mesmo banco (o que a publicação das novidades, na subida, precisa para ser testada).

export type Request = (path: string, method?: string, body?: unknown, cookie?: string) => Promise<Response>;

export interface RunningApi {
  request: Request;
  origin: string;
  port: number;
  dbPath: string;
  stop: () => Promise<void>;
}

export async function startApi(directory: string): Promise<RunningApi> {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const dbPath = join(directory, 'test.db');
  const child = spawn(process.execPath, ['--import', 'tsx', new URL('./index.ts', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')], {
    env: {
      ...process.env, PORT: String(port), DB_PATH: dbPath, NODE_ENV: 'test',
      WEB_ORIGIN: origin, COOKIE_SECURE: 'false', OPEN_REGISTRATION: 'true', INVITE_TOKEN: 'unused-invite-token',
      SESSION_SECRET: 's'.repeat(40), LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 's'.repeat(40),
      LIVEKIT_PUBLIC_URL: 'ws://127.0.0.1:1', LIVEKIT_INTERNAL_URL: 'http://127.0.0.1:1',
    },
    stdio: 'ignore',
  });
  const request: Request = (path, method = 'GET', body, cookie = '') =>
    fetch(origin + '/api' + path, {
      method,
      headers: { cookie, origin, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  let ready = false;
  for (let i = 0; i < 300 && !ready; i++) {
    try {
      await request('/auth/registration');
      ready = true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.ok(ready, 'a API sobe');
  return {
    request,
    origin,
    port,
    dbPath,
    stop: async () => {
      child.kill();
      await once(child, 'exit').catch(() => {});
    },
  };
}

export async function withTempDirectory(prefix: string, run: (directory: string) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), `${prefix}-`));
  try {
    await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export async function register(request: Request, username: string): Promise<{ cookie: string; id: string }> {
  const response = await request('/auth/register', 'POST', { username, password: 'test-password', accentColor: ACCENT_COLORS[0] });
  assert.equal(response.status, 201);
  const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
  const { user } = (await response.json()) as { user: { id: string } };
  return { cookie, id: user.id };
}
