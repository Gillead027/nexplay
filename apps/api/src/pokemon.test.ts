import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ACCENT_COLORS, type Server, type TextChannel, type TextMessage } from '@nexplay/shared';
import { brasiliaDate, catchChanceOf, fleeChanceOf, parsePokemonCommand, pickWildPokemon } from './pokemon.js';

type Request = (path: string, method?: string, body?: unknown, cookie?: string) => Promise<Response>;

async function withApi(roll: number, run: (request: Request, origin: string, directory: string) => Promise<void>) {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const directory = mkdtempSync(join(tmpdir(), 'pokemon-'));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', new URL('./index.ts', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')], {
    env: {
      ...process.env, PORT: String(port), DB_PATH: join(directory, 'test.db'), NODE_ENV: 'test', POKEMON_FIXED_ROLL: String(roll),
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
    await run(request, origin, directory);
  } finally {
    child.kill();
    await once(child, 'exit').catch(() => {});
    rmSync(directory, { recursive: true, force: true });
  }
}

async function setUp(request: Request, username: string) {
  const registered = await request('/auth/register', 'POST', { username, password: 'pokemon-password', accentColor: ACCENT_COLORS[0] });
  assert.equal(registered.status, 201);
  const cookie = registered.headers.get('set-cookie')!.split(';')[0]!;
  const { server } = (await (await request('/servers', 'POST', { name: 'Arena' }, cookie)).json()) as { server: Server };
  const { channels } = (await (await request(`/servers/${server.id}/text-channels`, 'GET', undefined, cookie)).json()) as { channels: TextChannel[] };
  const channel = channels[0]!;
  const say = async (text: string) => {
    const response = await request(`/servers/${server.id}/text-channels/${channel.id}/messages`, 'POST', { text }, cookie);
    assert.equal(response.status, 201);
    // as respostas do bot são gravadas logo depois de a resposta HTTP sair
    await new Promise((resolve) => setTimeout(resolve, 150));
  };
  const messages = async () => ((await (await request(`/servers/${server.id}/text-channels/${channel.id}/messages`, 'GET', undefined, cookie)).json()) as { messages: TextMessage[] }).messages;
  const bot = async () => (await messages()).filter((message) => message.senderType === 'GAME');
  return { cookie, server, channel, say, messages, bot };
}

// ---- regras (sem servidor)
test('as faixas de raridade aparecem na proporção esperada e o brilhante é raro', () => {
  const counts = { comum: 0, incomum: 0, raro: 0, lendario: 0 };
  let seed = 12345;
  const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let shiny = 0;
  const total = 20000;
  for (let i = 0; i < total; i += 1) {
    const wild = pickWildPokemon(rng);
    counts[wild.rarity] += 1;
    if (wild.shiny) shiny += 1;
  }
  assert.ok(counts.comum / total > 0.5 && counts.comum / total < 0.6, `comum ${counts.comum / total}`);
  assert.ok(counts.incomum / total > 0.26 && counts.incomum / total < 0.34, `incomum ${counts.incomum / total}`);
  assert.ok(counts.raro / total > 0.11 && counts.raro / total < 0.16, `raro ${counts.raro / total}`);
  assert.ok(counts.lendario / total > 0.008 && counts.lendario / total < 0.024, `lendário ${counts.lendario / total}`);
  assert.ok(shiny / total < 0.006, `brilhante ${shiny / total}`);
});

test('quanto mais raro, mais difícil de capturar e mais fácil de fugir', () => {
  assert.ok(catchChanceOf('comum') > catchChanceOf('incomum') && catchChanceOf('incomum') > catchChanceOf('raro') && catchChanceOf('raro') > catchChanceOf('lendario'));
  assert.ok(fleeChanceOf('lendario') > fleeChanceOf('raro') && fleeChanceOf('raro') > fleeChanceOf('comum'));
});

test('a data das Pokébolas do dia segue o horário de Brasília', () => {
  // 2026-09-21 02:30 UTC ainda é 20/09 à noite em Brasília (UTC-3); 03:00 UTC já é 21/09
  assert.equal(brasiliaDate(Date.UTC(2026, 8, 21, 2, 30)), '2026-09-20');
  assert.equal(brasiliaDate(Date.UTC(2026, 8, 21, 3, 0)), '2026-09-21');
});

test('só os comandos do jogo são reconhecidos', () => {
  assert.equal(parsePokemonCommand('!pokemon')?.command, 'pokemon');
  assert.equal(parsePokemonCommand('  !Capturar  ')?.command, 'capturar');
  assert.deepEqual(parsePokemonCommand('!time adicionar 3'), { command: 'time', args: ['adicionar', '3'] });
  assert.equal(parsePokemonCommand('!play musica'), null);
  assert.equal(parsePokemonCommand('oi !pokemon'), null);
  assert.equal(parsePokemonCommand('pokemon'), null);
});

// ---- o jogo pelo chat
test('jogo completo: procurar, capturar, Pokébolas do dia, coleção e time', async () => {
  await withApi(0.5, async (request) => {
    const { say, bot, messages } = await setUp(request, 'Treinadora');

    await say('!pokemon');
    let mensagens = await bot();
    const selvagem = mensagens.at(-1)!;
    assert.equal(selvagem.pokemonCard?.kind, 'wild');
    assert.equal(selvagem.pokemonCard?.status, 'wild');
    assert.equal(selvagem.pokemonCard?.entries[0]?.rarity, 'comum');
    assert.equal(selvagem.pokemonCard?.ownerName, 'Treinadora');

    // segunda procura logo em seguida: espera
    await say('!pokemon');
    mensagens = await bot();
    assert.match(mensagens.at(-1)!.text, /Calma, treinador/);

    await say('!capturar');
    mensagens = await bot();
    const capturado = mensagens.at(-1)!;
    assert.equal(capturado.pokemonCard?.kind, 'caught');
    assert.equal(capturado.pokemonCard?.entries[0]?.no, 1);
    assert.equal(capturado.pokemonCard?.balls, 9);
    // o cartão do Pokémon selvagem ficou marcado como capturado
    assert.equal(mensagens.find((message) => message.id === selvagem.id)?.pokemonCard?.status, 'caught');
    // a própria mensagem da pessoa continua no canal, antes da resposta
    const todas = await messages();
    assert.ok(todas.some((message) => message.senderType === 'HUMAN' && message.text === '!capturar'));

    await say('!capturar');
    assert.match((await bot()).at(-1)!.text, /nenhum Pokémon selvagem/);

    await say('!diario');
    assert.match((await bot()).at(-1)!.text, /resgatou \*\*10\*\* Pokébolas.*\*\*19\*\*/);
    await say('!diario');
    assert.match((await bot()).at(-1)!.text, /já resgatou/);
    await say('!bolas');
    assert.match((await bot()).at(-1)!.text, /\*\*19\*\* Pokébolas/);

    await say('!pokedex');
    assert.match((await bot()).at(-1)!.text, /#1.*Comum/s);

    await say('!time');
    assert.match((await bot()).at(-1)!.text, /time está vazio/);
    await say('!time adicionar 1');
    assert.equal((await bot()).at(-1)!.pokemonCard?.kind, 'team');
    assert.equal((await bot()).at(-1)!.pokemonCard?.entries.length, 1);
    await say('!time adicionar 1');
    assert.match((await bot()).at(-1)!.text, /já está no seu time/);
    await say('!time adicionar 99');
    assert.match((await bot()).at(-1)!.text, /número de um Pokémon da sua coleção/);
    await say('!time remover 1');
    assert.equal((await bot()).at(-1)!.pokemonCard?.entries.length, 0);

    // outra coisa com "!" não é do jogo: nenhuma resposta nova
    const antes = (await bot()).length;
    await say('!qualquercoisa');
    assert.equal((await bot()).length, antes);
  });
});

test('bola que falha gasta uma Pokébola; sem Pokébolas não dá para capturar', async () => {
  await withApi(0.9, async (request) => {
    const { say, bot } = await setUp(request, 'Azarado');
    await say('!pokemon');
    assert.equal((await bot()).at(-1)!.pokemonCard?.entries[0]?.rarity, 'raro');
    for (let tentativa = 1; tentativa <= 10; tentativa += 1) {
      await say('!capturar');
      const resposta = (await bot()).at(-1)!;
      assert.match(resposta.text, /A Pokébola falhou!.*ainda está aqui/, `tentativa ${tentativa}`);
      assert.match(resposta.text, new RegExp(`\\*\\*${10 - tentativa}\\*\\*`));
    }
    await say('!capturar');
    assert.match((await bot()).at(-1)!.text, /sem Pokébolas/);
    // fugir libera para procurar outro
    await say('!fugir');
    assert.match((await bot()).at(-1)!.text, /ir embora/);
  });
});

test('com muita sorte aparece um lendário e o aviso é diferente', async () => {
  await withApi(0.995, async (request) => {
    const { say, bot } = await setUp(request, 'Sortudo');
    await say('!pokemon');
    const mensagem = (await bot()).at(-1)!;
    assert.equal(mensagem.pokemonCard?.entries[0]?.rarity, 'lendario');
    assert.equal(mensagem.pokemonCard?.title, 'Pokémon lendário!');
    assert.match(mensagem.text, /LENDÁRIO/);
  });
});

test('imagem do Pokémon: só números válidos, só logado, e o que já está no disco é servido sem ir à internet', async () => {
  await withApi(0.5, async (request, origin, directory) => {
    const { cookie } = await setUp(request, 'Colecionador');
    assert.equal((await fetch(`${origin}/api/pokemon/sprite/25`, { headers: { origin } })).status, 401);
    assert.equal((await fetch(`${origin}/api/pokemon/sprite/0`, { headers: { cookie, origin } })).status, 404);
    assert.equal((await fetch(`${origin}/api/pokemon/sprite/1026`, { headers: { cookie, origin } })).status, 404);
    assert.equal((await fetch(`${origin}/api/pokemon/sprite/abc`, { headers: { cookie, origin } })).status, 404);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    mkdirSync(join(directory, 'pokemon-sprites'), { recursive: true });
    writeFileSync(join(directory, 'pokemon-sprites', '25.png'), png);
    const imagem = await fetch(`${origin}/api/pokemon/sprite/25`, { headers: { cookie, origin } });
    assert.equal(imagem.status, 200);
    assert.equal(imagem.headers.get('content-type'), 'image/png');
    assert.match(imagem.headers.get('cache-control') ?? '', /immutable/);
    assert.deepEqual(Buffer.from(await imagem.arrayBuffer()), png);
  });
});
