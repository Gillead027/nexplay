import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import WebSocket from 'ws';
import { ACCENT_COLORS } from '@nexplay/shared';
import { startApi, withTempDirectory } from './apiHarness.js';

const YEAR_SECONDS = 365 * 24 * 60 * 60;
// Mesmo segredo que o apiHarness dá à API de teste.
const SESSION_SECRET = 's'.repeat(40);

function setCookieOf(response: Response): string | null {
  return response.headers.get('set-cookie');
}

function cookiePairOf(setCookie: string): string {
  return setCookie.split(';')[0]!;
}

function maxAgeOf(setCookie: string): number {
  const match = /max-age=(\d+)/i.exec(setCookie);
  assert.ok(match, 'o cookie tem Max-Age');
  return Number(match[1]);
}

// Cookie no formato de antes do login permanente: sessão de 12 h, sem carimbo da senha.
function legacyCookie(userId: string, displayName: string): string {
  const payload = Buffer.from(JSON.stringify({ id: userId, displayName, expiresAt: Math.floor(Date.now() / 1000) + 12 * 60 * 60 })).toString('base64url');
  const signature = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `nexplay_session=${payload}.${signature}`;
}

function realtimeStatus(port: number, origin: string, cookie: string): Promise<'open' | number> {
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/realtime`, { headers: { cookie, origin } });
    socket.on('open', () => {
      socket.close();
      resolve('open');
    });
    socket.on('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0));
    socket.on('error', () => undefined);
  });
}

test('login permanente: o cookie dura um ano, é renovado, e trocar a senha derruba só os outros aparelhos', async () => {
  await withTempDirectory('persistent-login', async (directory) => {
    const api = await startApi(directory);
    try {
      const { request, origin, port } = api;

      const registered = await request('/auth/register', 'POST', { username: 'Ana', password: 'senha-antiga', accentColor: ACCENT_COLORS[0] });
      assert.equal(registered.status, 201);
      const registeredCookie = setCookieOf(registered)!;
      assert.equal(maxAgeOf(registeredCookie), YEAR_SECONDS, 'o cadastro já deixa a pessoa logada por um ano');
      const userId = ((await registered.json()) as { user: { id: string } }).user.id;

      // "Desligou o PC e abriu o app de novo": um login novo em outro aparelho entrega outro cookie de um ano.
      const login = await request('/auth/login', 'POST', { username: 'Ana', password: 'senha-antiga' });
      assert.equal(login.status, 200);
      const deviceB = cookiePairOf(setCookieOf(login)!);
      assert.equal(maxAgeOf(setCookieOf(login)!), YEAR_SECONDS);
      const deviceA = cookiePairOf(registeredCookie);
      assert.equal((await request('/session', 'GET', undefined, deviceA)).status, 200);
      assert.equal(await realtimeStatus(port, origin, deviceA), 'open', 'o tempo real aceita o cookie de um ano');

      // Sessão antiga (12 h, sem carimbo) ainda entra e já é trocada por uma permanente.
      const legacy = await request('/session', 'GET', undefined, legacyCookie(userId, 'Ana'));
      assert.equal(legacy.status, 200);
      const upgraded = setCookieOf(legacy);
      assert.ok(upgraded, 'a sessão antiga ganha um cookie novo');
      assert.equal(maxAgeOf(upgraded), YEAR_SECONDS);
      assert.equal((await request('/session', 'GET', undefined, cookiePairOf(upgraded))).status, 200);

      // Uma sessão recém-emitida não é reenviada a cada requisição.
      assert.equal(setCookieOf(await request('/session', 'GET', undefined, deviceA)), null);

      // Trocar a senha no aparelho A: A continua logado com cookie novo; B e o cookie antigo caem.
      const changed = await request('/auth/password', 'PATCH', { currentPassword: 'senha-antiga', newPassword: 'senha-nova-123' }, deviceA);
      assert.equal(changed.status, 204);
      const deviceANew = setCookieOf(changed);
      assert.ok(deviceANew, 'o aparelho que trocou a senha recebe um cookie novo');
      assert.equal((await request('/session', 'GET', undefined, cookiePairOf(deviceANew))).status, 200, 'quem trocou a senha continua logado');
      assert.equal((await request('/session', 'GET', undefined, deviceB)).status, 401, 'o outro aparelho precisa entrar de novo');
      assert.equal((await request('/session', 'GET', undefined, deviceA)).status, 401, 'o cookie de antes da troca não vale mais');
      assert.equal(await realtimeStatus(port, origin, deviceB), 401, 'nem no tempo real');
      assert.equal(await realtimeStatus(port, origin, cookiePairOf(deviceANew)), 'open');

      // Sair da conta continua funcionando.
      const logout = await request('/session', 'DELETE', undefined, cookiePairOf(deviceANew));
      assert.equal(logout.status, 204);
      assert.match(setCookieOf(logout) ?? '', /nexplay_session=;/, 'o cookie é apagado ao sair da conta');
    } finally {
      await api.stop();
    }
  });
});
