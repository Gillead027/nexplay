import type { MusicFilter } from '@nexplay/shared';

// Cadeia de filtros do FFmpeg de cada filtro do NexMusic (ver MUSIC_FILTERS em @nexplay/shared). Todas foram conferidas no
// FFmpeg 5.1 do container de produção. Filtros de áudio só se aplicam às faixas que passam pelo pipeline do yt-dlp (YouTube e
// Spotify, que usa YouTube para o áudio); arquivos locais não passam por aqui.
const FFMPEG_CHAINS: Record<MusicFilter, string | null> = {
  off: null,
  // Reforça os graves em torno de 110 Hz.
  bassboost: 'bass=g=10:f=110:w=0.6',
  // Toca mais rápido e mais agudo (1,25x): acelerar o relógio do áudio e reamostrar de volta para 48 kHz.
  nightcore: 'asetrate=60000,aresample=48000',
  // Faz o som girar de um lado para o outro (LFO de 0,09 Hz).
  '8d': 'apulsator=hz=0.09',
  // Tira o que está igual nos dois canais (quase sempre a voz no centro).
  karaoke: 'pan=stereo|c0=c0-c1|c1=c1-c0',
};

export function ffmpegChainFor(filter: MusicFilter): string | null {
  return FFMPEG_CHAINS[filter];
}

// Argumentos do FFmpeg que leem o áudio do yt-dlp pelo pipe e devolvem PCM s16le. O filtro entra antes da conversão de formato.
export function ffmpegPipeArgs(chain: string | null, sampleRate: number, channels: number): string[] {
  return [
    '-hide_banner', '-loglevel', 'error',
    '-i', 'pipe:0', '-vn',
    ...(chain ? ['-af', chain] : []),
    '-f', 's16le', '-ar', String(sampleRate),
    '-ac', String(channels), 'pipe:1',
  ];
}
