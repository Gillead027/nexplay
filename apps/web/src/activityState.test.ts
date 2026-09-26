import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicActivity, type Activity } from '@nexplay/shared';
import { activitiesFromResponse, applyActivityEvent } from './activityState';
import { formatActivityCompact } from './components/ActivityDisplay';

const game: Activity = { kind: 'playing', name: 'Valorant' };
const song: Activity = { kind: 'listening', app: 'Spotify', title: 'Tá Tranquilo', artist: 'Brandão85' };

test('a atividade de quem fica visível entra na lista, troca quando muda e some ao parar', () => {
  const start = new Map<string, Activity>();

  const playing = applyActivityEvent(start, { type: 'ACTIVITY_UPDATE', userId: 'ana', activity: game });
  assert.deepEqual(playing.get('ana'), game);
  assert.equal(start.size, 0, 'o mapa antigo não é alterado');

  const listening = applyActivityEvent(playing, { type: 'ACTIVITY_UPDATE', userId: 'ana', activity: song });
  assert.deepEqual(listening.get('ana'), song);

  assert.equal(applyActivityEvent(listening, { type: 'ACTIVITY_UPDATE', userId: 'ana', activity: { ...song } }), listening, 'mesma faixa: nada muda');
  assert.equal(applyActivityEvent(start, { type: 'ACTIVITY_UPDATE', userId: 'ana', activity: null }), start, 'parar sem nada antes: nada muda');

  const stopped = applyActivityEvent(listening, { type: 'ACTIVITY_UPDATE', userId: 'ana', activity: null });
  assert.equal(stopped.has('ana'), false);
});

test('a presença traz a atividade junto: ao ficar online aparece, ao ficar offline ou invisível some', () => {
  const start = new Map<string, Activity>();
  const online = applyActivityEvent(start, { type: 'PRESENCE_UPDATE', userId: 'ana', online: true, status: 'online', activity: song });
  assert.deepEqual(online.get('ana'), song);

  const idle = applyActivityEvent(online, { type: 'PRESENCE_UPDATE', userId: 'ana', online: true, status: 'idle', activity: song });
  assert.equal(idle, online, 'trocar o status sem mudar a atividade não mexe na lista');

  const offline = applyActivityEvent(online, { type: 'PRESENCE_UPDATE', userId: 'ana', online: false });
  assert.equal(offline.has('ana'), false);

  const noActivity = applyActivityEvent(online, { type: 'PRESENCE_UPDATE', userId: 'ana', online: true, status: 'online' });
  assert.equal(noActivity.has('ana'), false, 'voltou sem estar fazendo nada');
});

test('outros eventos e servidores antigos (sem "activities") não quebram nada', () => {
  const start = new Map<string, Activity>([['ana', game]]);
  assert.equal(applyActivityEvent(start, { type: 'MEMBER_LEAVE', serverId: 's', userId: 'ana' }), start);
  assert.equal(activitiesFromResponse({}).size, 0);
  assert.deepEqual(activitiesFromResponse({ activities: { ana: game } }).get('ana'), game);
});

test('a versão pública tira capa e tempo, limita o texto e descarta o que não tem o que mostrar', () => {
  const full: Activity = { kind: 'listening', app: 'Spotify', title: '  Tá Tranquilo ', artist: 'Brandão85', thumbnailDataUrl: 'data:image/jpeg;base64,AAAA', positionMs: 5000, durationMs: 200000, updatedAt: 1 };
  assert.deepEqual(publicActivity(full), { kind: 'listening', app: 'Spotify', title: 'Tá Tranquilo', artist: 'Brandão85' });
  assert.equal(publicActivity({ kind: 'playing', name: '   ' }), null);
  assert.equal(publicActivity({ kind: 'listening', app: 'Spotify', title: '', artist: 'X' }), null);
  const long = publicActivity({ kind: 'playing', name: 'a'.repeat(500) });
  assert.ok(long && long.kind === 'playing' && long.name.length === 120 && long.name.endsWith('…'));
});

test('o texto da lista de membros é curto: faixa e artista, ou "Jogando X"', () => {
  assert.equal(formatActivityCompact(song), 'Tá Tranquilo — Brandão85');
  assert.equal(formatActivityCompact({ ...song, artist: '' }), 'Tá Tranquilo');
  assert.equal(formatActivityCompact(game), 'Jogando Valorant');
});
