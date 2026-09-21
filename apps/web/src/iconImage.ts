// Utilitários do ícone de servidor: reconhece o formato pelos primeiros bytes e diz se a imagem é animada
// (GIF, WebP ou PNG animado), para o ícone poder ser guardado como veio, sem recomprimir nem perder a animação.

export type IconFormat = 'gif' | 'png' | 'webp' | 'jpeg';

export const ICON_MIME: Record<IconFormat, string> = {
  gif: 'image/gif',
  png: 'image/png',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
};

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));

export function sniffIconFormat(bytes: Uint8Array): IconFormat | null {
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')) return 'gif';
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return 'png';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  return null;
}

// GIF: conta os quadros (blocos "image descriptor"); mais de um quadro é animado.
function gifFrameCount(bytes: Uint8Array): number {
  let position = 13;
  if (bytes[10] !== undefined && (bytes[10] & 0x80) !== 0) position += 3 * 2 ** ((bytes[10] & 0x07) + 1);
  let frames = 0;
  const skipSubBlocks = () => {
    while (position < bytes.length && bytes[position] !== 0) position += bytes[position]! + 1;
    position += 1;
  };
  while (position < bytes.length) {
    const marker = bytes[position];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      position += 2;
      skipSubBlocks();
    } else if (marker === 0x2c) {
      frames += 1;
      if (frames > 1) return frames;
      const flags = bytes[position + 9] ?? 0;
      position += 10;
      if ((flags & 0x80) !== 0) position += 3 * 2 ** ((flags & 0x07) + 1);
      position += 1;
      skipSubBlocks();
    } else {
      break;
    }
  }
  return frames;
}

// PNG animado (APNG) tem um bloco "acTL" antes dos dados da imagem.
function pngIsAnimated(bytes: Uint8Array): boolean {
  let position = 8;
  while (position + 8 <= bytes.length) {
    const length = ((bytes[position]! << 24) | (bytes[position + 1]! << 16) | (bytes[position + 2]! << 8) | bytes[position + 3]!) >>> 0;
    const type = ascii(bytes, position + 4, 4);
    if (type === 'acTL') return true;
    if (type === 'IDAT') return false;
    position += 12 + length;
  }
  return false;
}

// WebP animado: o bloco "VP8X" tem o bit de animação ligado.
function webpIsAnimated(bytes: Uint8Array): boolean {
  let position = 12;
  while (position + 8 <= bytes.length) {
    const type = ascii(bytes, position, 4);
    const size = (bytes[position + 4]! | (bytes[position + 5]! << 8) | (bytes[position + 6]! << 16) | (bytes[position + 7]! << 24)) >>> 0;
    if (type === 'VP8X') return ((bytes[position + 8] ?? 0) & 0x02) !== 0;
    position += 8 + size + (size % 2);
  }
  return false;
}

export function isAnimatedImage(bytes: Uint8Array, format: IconFormat): boolean {
  switch (format) {
    case 'gif': return gifFrameCount(bytes) > 1;
    case 'png': return pngIsAnimated(bytes);
    case 'webp': return webpIsAnimated(bytes);
    default: return false;
  }
}

// Mesma checagem, a partir de uma data: URL já guardada. O resultado fica em cache: a barra de servidores pergunta
// a cada renderização, e decodificar até 1 MB de base64 toda vez seria desperdício.
const animatedCache = new Map<string, boolean>();

export function dataUrlIsAnimated(dataUrl: string): boolean {
  const match = /^data:image\/(gif|png|webp);base64,/.exec(dataUrl);
  if (!match) return false;
  const key = `${dataUrl.length}:${dataUrl.slice(-48)}`;
  const cached = animatedCache.get(key);
  if (cached !== undefined) return cached;
  let animated = false;
  try {
    const binary = atob(dataUrl.slice(match[0].length));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    animated = isAnimatedImage(bytes, match[1] as IconFormat);
  } catch {
    animated = false;
  }
  animatedCache.set(key, animated);
  return animated;
}
