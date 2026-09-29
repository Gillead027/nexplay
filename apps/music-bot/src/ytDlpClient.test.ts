import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePlaylistJson } from './ytDlpClient.js';

// Formato reduzido do que o yt-dlp devolve pra "ytsearch5:<nome de artista>": quando a busca bate com o nome de um
// canal, o YouTube inclui o cartão do canal como um dos resultados (visto de verdade buscando "Brandão85" — ver
// memória do bug). Sem filtro, esse cartão vira a "faixa" #1 e, ao tocar, o yt-dlp baixa o canal inteiro em sequência
// no lugar de uma música (ver comentário de isPlayableVideoUrl em ytDlpClient.ts).
const channelCard = {
  _type: 'url', id: 'UC5J2TW5U49M338IabYyvU6w', ie_key: 'YoutubeTab',
  url: 'https://www.youtube.com/channel/UC5J2TW5U49M338IabYyvU6w',
  title: 'Brandão85', channel: 'Brandão85', uploader: 'Brandão85',
};
const song = {
  _type: 'url', ie_key: 'Youtube', id: 'In6wO27WWqw', url: 'https://www.youtube.com/watch?v=In6wO27WWqw',
  title: 'BRANDÃO85 - NOITE PERFEITA', uploader: '30PRAUM', duration: 169,
};

test('o cartão de canal que a busca por nome de artista traz junto não vira uma "faixa" tocável', () => {
  const tracks = parsePlaylistJson(JSON.stringify({ entries: [channelCard, song] }));
  assert.equal(tracks.length, 1, 'só a música de verdade sobra');
  assert.equal(tracks[0]!.id, 'In6wO27WWqw');
  assert.equal(tracks[0]!.webpage_url, 'https://www.youtube.com/watch?v=In6wO27WWqw');
  assert.equal(tracks[0]!.title, 'BRANDÃO85 - NOITE PERFEITA');
});

test('outras páginas que não são um vídeo (playlist, usuário, @handle) também são descartadas', () => {
  const playlistEntry = { id: 'PL123', url: 'https://www.youtube.com/playlist?list=PL123', title: 'Uma playlist' };
  const handleEntry = { id: 'UCabc', url: 'https://www.youtube.com/@algumArtista', title: 'Algum Artista' };
  const userEntry = { id: 'UCdef', url: 'https://www.youtube.com/user/algumArtista', title: 'Algum Artista' };
  const tracks = parsePlaylistJson(JSON.stringify({ entries: [playlistEntry, handleEntry, userEntry, song] }));
  assert.deepEqual(tracks.map((track) => track.id), ['In6wO27WWqw']);
});

test('vídeo normal, youtu.be e shorts continuam passando (o que uma playlist de verdade traz)', () => {
  const short = { id: 's1', url: 'https://www.youtube.com/shorts/abcdefghijk', title: 'Um short' };
  const shortLink = { id: 's2', url: 'https://youtu.be/abcdefghijk', title: 'O mesmo, encurtado' };
  const tracks = parsePlaylistJson(JSON.stringify({ entries: [song, short, shortLink] }));
  assert.deepEqual(tracks.map((track) => track.id), ['In6wO27WWqw', 's1', 's2']);
});

test('sem título, cai pro slug da URL, e sem id a entrada é descartada em vez de quebrar tudo', () => {
  const untitled = { id: 'z1', url: 'https://www.youtube.com/watch?v=z1', title: '   ' };
  const withoutId = { url: 'https://www.youtube.com/watch?v=z2', title: 'Sem id' };
  const tracks = parsePlaylistJson(JSON.stringify({ entries: [untitled, withoutId] }));
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0]!.id, 'z1');
});

test('resposta sem "entries" ou que não é um objeto dá erro claro, não uma lista vazia silenciosa', () => {
  assert.throws(() => parsePlaylistJson('null'), /yt-dlp retornou playlist inválida/);
  assert.throws(() => parsePlaylistJson('{}'), /yt-dlp não retornou faixas da playlist/);
});
