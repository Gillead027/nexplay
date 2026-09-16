import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MusicProvider } from './musicProvider.js';
import { SpotifyProvider } from './spotifyProvider.js';

const fallbackTrack = {
  providerId: 'youtube', sourceId: 'yt1', title: 'Numb', author: 'Linkin Park',
  durationMs: 187_000, webUrl: 'https://youtube.com/watch?v=yt1', thumbnailUrl: undefined,
};
const fallback: MusicProvider = {
  id: 'youtube',
  canHandleUrl: () => false,
  search: async () => [fallbackTrack],
  resolveUrl: async () => fallbackTrack,
  resolvePlayable: async () => ({ input: fallbackTrack.webUrl, providerId: 'youtube', transport: 'YTDLP_PIPE' }),
};

describe('SpotifyProvider metadata bridge', () => {
  it('imports public playlists in order without using 30-second previews', async () => {
    const entity = { trackList: [
      { uri: 'spotify:track:a1', title: 'Numb', subtitle: 'Linkin Park', duration: 187000, audioPreview: { url: 'https://preview.example/short.mp3' } },
      { uri: 'spotify:track:a2', title: 'In the End', subtitle: 'Linkin Park', duration: 216000 },
      { uri: 'spotify:episode:e1', title: 'Podcast', subtitle: 'Speaker' },
    ] };
    const fakeFetch = async () => new Response(`<script type="application/json" id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { state: { data: { entity } } } } })}</script>`);
    const provider = new SpotifyProvider(fallback, fakeFetch as typeof fetch);
    const tracks = await provider.resolvePlaylist(new URL('https://open.spotify.com/intl-pt/playlist/public1'));
    assert.deepEqual(tracks.map((track) => track.sourceId), ['a1', 'a2']);
    assert.equal(tracks[0]?.durationMs, 187000);
    assert.equal((await provider.resolvePlayable(tracks[0]!)).providerId, 'youtube');
    assert.ok(!JSON.stringify(tracks).includes('preview.example'));
  });

  it('reports unavailable playlist metadata rather than using preview audio', async () => {
    const provider = new SpotifyProvider(fallback, (async () => new Response('{}')) as typeof fetch);
    await assert.rejects(provider.resolvePlaylist(new URL('https://open.spotify.com/playlist/unavailable')), /não disponibilizou/);
  });

  it('rejects short previews and unrelated versions when matching Spotify tracks', async () => {
    const provider = new SpotifyProvider({ ...fallback, search: async () => [
      { ...fallbackTrack, durationMs: 30000 },
      { ...fallbackTrack, title: 'Unrelated song' },
    ] });
    await assert.rejects(provider.resolvePlayable({ ...fallbackTrack, providerId: 'spotify' }), /Não encontrei/);
  });

  it('matches artist and duration instead of blindly using the first result', async () => {
    const resolved: string[] = [];
    const provider = new SpotifyProvider({ ...fallback, search: async () => [
      { ...fallbackTrack, sourceId: 'wrong', title: 'Numb Live', durationMs: 350000 },
      fallbackTrack,
    ], resolvePlayable: async (track) => { resolved.push(track.sourceId); return fallback.resolvePlayable(track); } });
    await provider.resolvePlayable({ ...fallbackTrack, providerId: 'spotify' });
    assert.deepEqual(resolved, ['yt1']);
  });

  it('lê metadata pública e usa YouTube somente como fonte reproduzível', async () => {
    const fakeFetch = async () => new Response(JSON.stringify({
      title: 'Numb - song and lyrics by Linkin Park | Spotify',
      thumbnail_url: 'https://i.scdn.co/image/test',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    const provider = new SpotifyProvider(fallback, fakeFetch as typeof fetch);
    const track = await provider.resolveUrl(new URL('https://open.spotify.com/track/abc123'));
    assert.equal(track.providerId, 'spotify');
    assert.equal(track.title, 'Numb');
    assert.equal(track.author, 'Linkin Park');
    assert.equal(track.thumbnailUrl, 'https://i.scdn.co/image/test');    const playable = await provider.resolvePlayable(track);
    assert.equal(playable.providerId, 'youtube');
    assert.equal(playable.transport, 'YTDLP_PIPE');
  });

  it('rejeita URLs que não são tracks do Spotify', async () => {
    const provider = new SpotifyProvider(fallback, (async () => new Response('{}')) as typeof fetch);
    await assert.rejects(
      provider.resolveUrl(new URL('https://open.spotify.com/album/abc')),
      /URL do Spotify inválida/,
    );
  });
});
