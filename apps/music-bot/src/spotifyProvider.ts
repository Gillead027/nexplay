import type {
  MusicProvider,
  PlayableMusicSource,
  ResolvedMusicTrack,
} from './musicProvider.js';

const SPOTIFY_HOSTS = new Set(['open.spotify.com', 'www.open.spotify.com']);

interface SpotifyOEmbed {
  title?: string;
  thumbnail_url?: string;
}

interface SpotifyEmbedEntity {
  id?: string;
  title?: string;
  name?: string;
  duration?: number;
  artists?: Array<{ name?: string }>;
  visualIdentity?: { image?: Array<{ url?: string; maxWidth?: number }> };
  trackList?: Array<{
    uri?: string;
    title?: string;
    subtitle?: string;
    duration?: number;
    entityType?: string;
  }>;
}

function spotifyId(url: URL): string {
  const parts = url.pathname.split('/').filter(Boolean);
  const index = parts.findIndex((part) => part === 'track');
  return index >= 0 && parts[index + 1] ? parts[index + 1]! : '';
}

function parseEmbedEntity(html: string): SpotifyEmbedEntity | null {
  const match = /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]) as {
      props?: { pageProps?: { state?: { data?: { entity?: SpotifyEmbedEntity } } } };
    };
    return parsed.props?.pageProps?.state?.data?.entity ?? null;
  } catch {
    return null;
  }
}

function bestImage(entity: SpotifyEmbedEntity): string | undefined {
  const images = entity.visualIdentity?.image?.filter((item) => typeof item.url === 'string') ?? [];
  return [...images].sort((a, b) => (b.maxWidth ?? 0) - (a.maxWidth ?? 0))[0]?.url;
}

function cleanupTitle(value: string): { title: string; author: string } {
  const stripped = value.replace(/\s*\|\s*Spotify\s*$/i, '').trim();
  const match = /^(.*?)\s+-\s+song and lyrics by\s+(.+)$/i.exec(stripped);
  if (match?.[1] && match[2]) return { title: match[1].trim(), author: match[2].trim() };
  return { title: stripped || 'Spotify track', author: 'Spotify' };
}

export class SpotifyProvider implements MusicProvider {
  readonly id = 'spotify';

  constructor(
    private readonly fallback: MusicProvider,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  canHandleUrl(url: URL): boolean {
    return (url.protocol === 'https:' || url.protocol === 'http:') &&
      SPOTIFY_HOSTS.has(url.hostname.toLowerCase()) &&
      /^\/(?:intl-[a-z-]+\/)?(?:track|playlist|album)\/[a-zA-Z0-9]+\/?$/.test(url.pathname);
  }

  async search(query: string): Promise<ResolvedMusicTrack[]> {
    return this.fallback.search(query);
  }

  async resolveUrl(url: URL): Promise<ResolvedMusicTrack> {
    if (!this.canHandleUrl(url) || !spotifyId(url)) throw new Error('URL do Spotify inválida. Use /playlist para playlists e álbuns.');
    const id = spotifyId(url);
    if (!id) throw new Error('Não consegui identificar a faixa do Spotify.');

    const embedUrl = `https://open.spotify.com/embed/track/${encodeURIComponent(id)}`;
    const embedResponse = await this.fetchImpl(embedUrl, { signal: AbortSignal.timeout(10_000) });
    if (embedResponse.ok) {
      const entity = parseEmbedEntity(await embedResponse.text());
      if (entity) {
        const author = entity.artists?.map(({ name }) => name).filter(Boolean).join(', ') || 'Spotify';
        return {
          providerId: this.id,
          sourceId: entity.id || id,
          title: entity.title || entity.name || 'Spotify track',
          author,
          durationMs: Number.isFinite(entity.duration) ? Math.max(0, Math.round(entity.duration ?? 0)) : 0,
          webUrl: url.toString(),
          thumbnailUrl: bestImage(entity),
        };
      }
    }

    const endpoint = new URL('https://open.spotify.com/oembed');
    endpoint.searchParams.set('url', url.toString());
    const response = await this.fetchImpl(endpoint, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Spotify metadata falhou (${response.status}).`);
    const data = await response.json() as SpotifyOEmbed;
    const parsed = cleanupTitle(data.title ?? '');
    return {
      providerId: this.id,
      sourceId: id,
      title: parsed.title,
      author: parsed.author,
      durationMs: 0,
      webUrl: url.toString(),
      thumbnailUrl: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : undefined,
    };
  }

  async resolvePlayable(track: ResolvedMusicTrack): Promise<PlayableMusicSource> {
    if (track.providerId !== this.id) throw new Error('Track pertence a outro provider.');
    const query = `${track.title} ${track.author}`.trim();
    const candidates = await this.fallback.search(query);
    const normalized = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const titleWords = normalized(track.title).split(' ').filter(Boolean);
    const artistWords = normalized(track.author).split(' ').filter(Boolean);
    const ranked = candidates.flatMap((candidate) => {
      const text = normalized(`${candidate.title} ${candidate.author}`);
      const versions = ['remix', 'sped up', 'slowed', '8d', 'nightcore', 'cover', 'ao vivo', 'live'];
      if (versions.some((version) => new RegExp(`\\b${version}\\b`).test(normalized(candidate.title)) && !new RegExp(`\\b${version}\\b`).test(normalized(track.title)))) return [];
      const titleMatches = titleWords.filter((word) => text.split(' ').includes(word)).length;
      if (titleMatches < Math.ceil(titleWords.length * 0.7)) return [];
      if (track.author !== 'Spotify' && !artistWords.some((word) => text.split(' ').includes(word))) return [];
      const delta = Math.abs(candidate.durationMs - track.durationMs);
      if (track.durationMs > 0 && candidate.durationMs > 0 && delta > Math.max(15_000, track.durationMs * 0.1)) return [];
      return [{ candidate, score: titleMatches * 10 - (track.durationMs && candidate.durationMs ? delta / 1_000 : 15) }];
    }).sort((a, b) => b.score - a.score);
    const matched = ranked[0]?.candidate;
    if (!matched) throw new Error('Não encontrei uma fonte pública correspondente para o item do Spotify.');
    return this.fallback.resolvePlayable(matched);
  }

  isPlaylistUrl(url: URL): boolean {
    return this.canHandleUrl(url) && /^\/(?:intl-[a-z-]+\/)?(?:playlist|album)\//.test(url.pathname);
  }

  async resolvePlaylist(url: URL): Promise<ResolvedMusicTrack[]> {
    if (!this.canHandleUrl(url)) throw new Error('URL do Spotify inválida.');
    const match = /\/(playlist|album)\/([a-zA-Z0-9]+)/.exec(url.pathname);
    if (!match) throw new Error('Informe um link de playlist ou álbum do Spotify.');
    const response = await this.fetchImpl(`https://open.spotify.com/embed/${match[1]}/${match[2]}`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Não foi possível consultar a playlist do Spotify (${response.status}).`);
    const entity = parseEmbedEntity(await response.text());
    if (!entity?.trackList?.length) throw new Error('O Spotify não disponibilizou as faixas deste link. Use uma playlist pública ou um álbum.');
    const tracks = entity.trackList.flatMap((item): ResolvedMusicTrack[] => {
      const id = /^spotify:track:([a-zA-Z0-9]+)$/.exec(item.uri ?? '')?.[1];
      if (!id || !item.title || !item.subtitle) return [];
      return [{ providerId: this.id, sourceId: id, title: item.title, author: item.subtitle,
        durationMs: Number.isFinite(item.duration) ? Math.max(0, Math.round(item.duration!)) : 0,
        webUrl: `https://open.spotify.com/track/${id}`, thumbnailUrl: bestImage(entity) }];
    });
    if (!tracks.length) throw new Error('Nenhuma faixa musical foi disponibilizada pelo Spotify neste link.');
    return tracks;
  }
}
