import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ACCENT_COLORS, SERVER_ICON_DATA_URL_MAX_LENGTH, type Server } from '@nexplay/shared';

type Request = (path: string, method?: string, body?: unknown, cookie?: string) => Promise<Response>;

async function withApi(run: (request: Request, origin: string) => Promise<void>) {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const directory = mkdtempSync(join(tmpdir(), 'server-images-'));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', new URL('./index.ts', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')], {
    env: {
      ...process.env, PORT: String(port), DB_PATH: join(directory, 'test.db'), NODE_ENV: 'test',
      WEB_ORIGIN: origin, COOKIE_SECURE: 'false', OPEN_REGISTRATION: 'true',
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

async function signUp(request: Request, username: string): Promise<string> {
  const response = await request('/auth/register', 'POST', { username, password: 'images-password', accentColor: ACCENT_COLORS[0] });
  assert.equal(response.status, 201);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

const ascii = (text: string) => Array.from(text).map((character) => character.charCodeAt(0));

// GIF 1x1 com N quadros.
function gif(frames: number): Buffer {
  const header = [...ascii('GIF89a'), 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff];
  const frame = [0x21, 0xf9, 0x04, 0x00, 10, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0x02, 0x02, 0x44, 0x01, 0];
  return Buffer.from([...header, ...Array.from({ length: frames }, () => frame).flat(), 0x3b]);
}

const dataUrl = (bytes: Buffer, mime: string) => `data:${mime};base64,${bytes.toString('base64')}`;

test('ícone e painel do servidor: a lista leva só a URL, a imagem vem por rota própria e o GIF fica marcado como animado', async () => {
  await withApi(async (request, origin) => {
    const dono = await signUp(request, 'DonoImagens');
    const { server } = (await (await request('/servers', 'POST', { name: 'Com imagens' }, dono)).json()) as { server: Server };
    assert.equal(server.iconUrl, '');
    assert.equal(server.bannerUrl, '');

    const icone = gif(3);
    const painel = gif(1);
    const atualizado = await request(`/servers/${server.id}`, 'PATCH', { iconDataUrl: dataUrl(icone, 'image/gif'), bannerDataUrl: dataUrl(painel, 'image/gif') }, dono);
    assert.equal(atualizado.status, 200);
    const { server: novo } = (await atualizado.json()) as { server: Server };
    assert.match(novo.iconUrl, new RegExp(`^/api/servers/${server.id}/icon\\?v=1$`));
    assert.equal(novo.iconAnimated, true);
    assert.equal(novo.bannerAnimated, false);
    assert.ok(!JSON.stringify(novo).includes('base64'), 'a lista não carrega a imagem');

    const imagem = await fetch(origin + novo.iconUrl, { headers: { cookie: dono, origin } });
    assert.equal(imagem.status, 200);
    assert.equal(imagem.headers.get('content-type'), 'image/gif');
    assert.match(imagem.headers.get('cache-control') ?? '', /immutable/);
    assert.deepEqual(Buffer.from(await imagem.arrayBuffer()), icone);
    assert.equal((await fetch(origin + novo.bannerUrl, { headers: { cookie: dono, origin } })).status, 200);

    // trocar só o nome não mexe na versão da imagem; trocar a imagem muda
    const soNome = (await (await request(`/servers/${server.id}`, 'PATCH', { name: 'Outro nome' }, dono)).json()) as { server: Server };
    assert.equal(soNome.server.iconUrl, novo.iconUrl);
    const trocado = (await (await request(`/servers/${server.id}`, 'PATCH', { iconDataUrl: dataUrl(gif(1), 'image/gif') }, dono)).json()) as { server: Server };
    assert.match(trocado.server.iconUrl, /v=2$/);
    assert.equal(trocado.server.iconAnimated, false);

    // remover
    const removido = (await (await request(`/servers/${server.id}`, 'PATCH', { bannerDataUrl: '' }, dono)).json()) as { server: Server };
    assert.equal(removido.server.bannerUrl, '');
    assert.equal((await fetch(origin + `/api/servers/${server.id}/banner`, { headers: { cookie: dono, origin } })).status, 404);
  });
});

test('ícone e painel: só membro vê a imagem, só quem gerencia troca, e o conteúdo precisa ser mesmo uma imagem', async () => {
  await withApi(async (request, origin) => {
    const dono = await signUp(request, 'DonoSeguro');
    const outro = await signUp(request, 'Curioso');
    const { server } = (await (await request('/servers', 'POST', { name: 'Fechado' }, dono)).json()) as { server: Server };
    const icone = dataUrl(gif(2), 'image/gif');
    assert.equal((await request(`/servers/${server.id}`, 'PATCH', { iconDataUrl: icone }, dono)).status, 200);

    // quem não é do servidor não vê a imagem nem consegue trocá-la
    assert.notEqual((await fetch(origin + `/api/servers/${server.id}/icon`, { headers: { cookie: outro, origin } })).status, 200);
    assert.notEqual((await request(`/servers/${server.id}`, 'PATCH', { iconDataUrl: icone }, outro)).status, 200);
    // sem sessão, também não
    assert.equal((await fetch(origin + `/api/servers/${server.id}/icon`, { headers: { origin } })).status, 401);

    // texto que se diz GIF, mas não é
    const falso = dataUrl(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/gif');
    assert.equal((await request(`/servers/${server.id}`, 'PATCH', { iconDataUrl: falso }, dono)).status, 400);
    assert.equal((await request(`/servers/${server.id}`, 'PATCH', { bannerDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }, dono)).status, 400);
  });
});

test('ícone aceita até 3 MB e recusa mais que isso', async () => {
  await withApi(async (request) => {
    const dono = await signUp(request, 'DonoGrande');
    const { server } = (await (await request('/servers', 'POST', { name: 'Grande' }, dono)).json()) as { server: Server };
    // GIF válido de ~2 MB (o do usuário): um comentário grande no meio do arquivo não muda que é um GIF
    const base = gif(2);
    const recheio = Buffer.alloc(2 * 1024 * 1024, 0);
    const doisMb = Buffer.concat([base.subarray(0, 13 + 6), Buffer.from([0x21, 0xfe]), ...Array.from({ length: Math.ceil(recheio.length / 255) }, (_, i) => {
      const parte = recheio.subarray(i * 255, (i + 1) * 255);
      return Buffer.concat([Buffer.from([parte.length]), parte]);
    }), Buffer.from([0]), base.subarray(13 + 6)]);
    const aceito = await request(`/servers/${server.id}`, 'PATCH', { iconDataUrl: dataUrl(doisMb, 'image/gif') }, dono);
    assert.equal(aceito.status, 200);
    assert.ok(dataUrl(doisMb, 'image/gif').length < SERVER_ICON_DATA_URL_MAX_LENGTH);

    const grandeDemais = Buffer.concat([doisMb, Buffer.alloc(1.5 * 1024 * 1024, 0)]);
    assert.ok(dataUrl(grandeDemais, 'image/gif').length > SERVER_ICON_DATA_URL_MAX_LENGTH);
    assert.equal((await request(`/servers/${server.id}`, 'PATCH', { iconDataUrl: dataUrl(grandeDemais, 'image/gif') }, dono)).status, 400);
  });
});
