import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ACCENT_COLORS, type MemberSummary, type Server, type UserSession } from '@nexplay/shared';

type Request = (path: string, method?: string, body?: unknown, cookie?: string) => Promise<Response>;

async function withApi(run: (request: Request, origin: string) => Promise<void>) {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const directory = mkdtempSync(join(tmpdir(), 'profile-images-'));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', new URL('./index.ts', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')], {
    env: {
      ...process.env, PORT: String(port), DB_PATH: join(directory, 'test.db'), NODE_ENV: 'test',
      WEB_ORIGIN: origin, COOKIE_SECURE: 'false', OPEN_REGISTRATION: 'true', INVITE_TOKEN: 'unused-invite-token',
      SESSION_SECRET: 's'.repeat(40), LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 's'.repeat(40),
      LIVEKIT_PUBLIC_URL: 'ws://127.0.0.1:1', LIVEKIT_INTERNAL_URL: 'http://127.0.0.1:1',
    },
    stdio: 'ignore',
  });
  const request: Request = (path, method = 'GET', body, cookie = '') =>
    fetch(origin + '/api' + path, { method, headers: { cookie, origin, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { await request('/auth/registration'); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, 'API starts');
    await run(request, origin);
  } finally {
    child.kill();
    await once(child, 'exit').catch(() => {});
    rmSync(directory, { recursive: true, force: true });
  }
}

async function signUp(request: Request, username: string): Promise<{ cookie: string; user: UserSession }> {
  const response = await request('/auth/register', 'POST', { username, password: 'profile-password', accentColor: ACCENT_COLORS[0] });
  assert.equal(response.status, 201);
  const { user } = (await response.json()) as { user: UserSession };
  return { cookie: response.headers.get('set-cookie')!.split(';')[0]!, user };
}

const ascii = (text: string) => Array.from(text).map((character) => character.charCodeAt(0));

function gif(frames: number): Buffer {
  const header = [...ascii('GIF89a'), 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff];
  const frame = [0x21, 0xf9, 0x04, 0x00, 10, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0x02, 0x02, 0x44, 0x01, 0];
  return Buffer.from([...header, ...Array.from({ length: frames }, () => frame).flat(), 0x3b]);
}

const dataUrl = (bytes: Buffer, mime: string) => `data:${mime};base64,${bytes.toString('base64')}`;
const profile = (extra: Record<string, unknown>) => ({ accentColor: ACCENT_COLORS[0], statusText: '', bio: '', pronouns: '', avatarUrl: '', ...extra });

test('capa do perfil: GIF animado fica animado, vem por URL própria e qualquer conta logada vê', async () => {
  await withApi(async (request, origin) => {
    const dona = await signUp(request, 'DonaDaCapa');
    const outra = await signUp(request, 'Visitante');
    const capa = gif(3);
    const salvo = await request('/profile', 'PATCH', profile({ bannerDataUrl: dataUrl(capa, 'image/gif') }), dona.cookie);
    assert.equal(salvo.status, 200);
    const { user } = (await salvo.json()) as { user: UserSession };
    assert.match(user.bannerUrl, new RegExp(`^/api/users/${dona.user.id}/banner\\?v=1$`));
    assert.equal(user.bannerAnimated, true);
    assert.ok(!JSON.stringify(user).includes('base64'), 'o perfil não carrega a imagem');

    const imagem = await fetch(origin + user.bannerUrl, { headers: { cookie: outra.cookie, origin } });
    assert.equal(imagem.status, 200);
    assert.equal(imagem.headers.get('content-type'), 'image/gif');
    assert.deepEqual(Buffer.from(await imagem.arrayBuffer()), capa);
    assert.equal((await fetch(origin + user.bannerUrl, { headers: { origin } })).status, 401);

    // salvar de novo sem mexer na capa (é o que o app faz ao editar o status) mantém a capa e a versão
    const semMexer = (await (await request('/profile', 'PATCH', profile({ statusText: 'oi' }), dona.cookie)).json()) as { user: UserSession };
    assert.equal(semMexer.user.bannerUrl, user.bannerUrl);
    assert.equal(semMexer.user.statusText, 'oi');
    const perfilDeOutro = (await (await request(`/users/${dona.user.id}/profile`, 'GET', undefined, outra.cookie)).json()) as { user: UserSession };
    assert.equal(perfilDeOutro.user.bannerAnimated, true);

    // trocar muda a versão; '' remove
    const trocada = (await (await request('/profile', 'PATCH', profile({ bannerDataUrl: dataUrl(gif(1), 'image/gif') }), dona.cookie)).json()) as { user: UserSession };
    assert.match(trocada.user.bannerUrl, /v=2$/);
    assert.equal(trocada.user.bannerAnimated, false);
    const removida = (await (await request('/profile', 'PATCH', profile({ bannerDataUrl: '' }), dona.cookie)).json()) as { user: UserSession };
    assert.equal(removida.user.bannerUrl, '');
    assert.equal((await fetch(origin + `/api/users/${dona.user.id}/banner`, { headers: { cookie: dona.cookie, origin } })).status, 404);

    // só imagem de verdade
    const falso = dataUrl(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/gif');
    assert.equal((await request('/profile', 'PATCH', profile({ bannerDataUrl: falso }), dona.cookie)).status, 400);
  });
});

test('borda animada do avatar: só as bordas da lista, aparece para os outros e não some ao editar o perfil', async () => {
  await withApi(async (request) => {
    const dono = await signUp(request, 'DonoBorda');
    const amigo = await signUp(request, 'AmigoBorda');
    assert.equal(dono.user.avatarFrame, '');

    const escolhida = (await (await request('/profile', 'PATCH', profile({ avatarFrame: 'aurora' }), dono.cookie)).json()) as { user: UserSession };
    assert.equal(escolhida.user.avatarFrame, 'aurora');
    assert.equal((await request('/profile', 'PATCH', profile({ avatarFrame: 'inexistente' }), dono.cookie)).status, 400);

    // sem foto, mas com borda: quem consulta o avatar recebe a borda
    const avatar = (await (await request(`/users/${dono.user.id}/avatar`, 'GET', undefined, amigo.cookie)).json()) as { avatarUrl: string; avatarFrame: string };
    assert.deepEqual(avatar, { avatarUrl: '', avatarFrame: 'aurora' });

    // editar outra coisa não tira a borda
    const editado = (await (await request('/profile', 'PATCH', profile({ bio: 'novo texto' }), dono.cookie)).json()) as { user: UserSession };
    assert.equal(editado.user.avatarFrame, 'aurora');

    // a lista de membros do servidor traz a borda
    const { server } = (await (await request('/servers', 'POST', { name: 'Com bordas' }, dono.cookie)).json()) as { server: Server };
    const membros = (await (await request(`/servers/${server.id}/members`, 'GET', undefined, dono.cookie)).json()) as { members: MemberSummary[] };
    assert.equal(membros.members.find((member) => member.id === dono.user.id)?.avatarFrame, 'aurora');

    // remover a borda
    const sem = (await (await request('/profile', 'PATCH', profile({ avatarFrame: '' }), dono.cookie)).json()) as { user: UserSession };
    assert.equal(sem.user.avatarFrame, '');
  });
});
