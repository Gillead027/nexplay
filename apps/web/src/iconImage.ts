// Reconhecimento de formato e de animação de imagens: a implementação mora em @nexplay/shared (a API usa a mesma). Aqui
// ficam só os nomes usados pelo app e a checagem de uma data: URL com cache.
import { parseImageDataUrl } from '@nexplay/shared';

export { IMAGE_MIME as ICON_MIME, isAnimatedImage, sniffImageFormat as sniffIconFormat } from '@nexplay/shared';
export type { ImageFormat as IconFormat } from '@nexplay/shared';

// A barra de servidores pergunta a cada renderização; decodificar megabytes de base64 toda vez seria desperdício.
const animatedCache = new Map<string, boolean>();

export function dataUrlIsAnimated(dataUrl: string): boolean {
  if (!dataUrl.startsWith('data:image/')) return false;
  const key = `${dataUrl.length}:${dataUrl.slice(-48)}`;
  const cached = animatedCache.get(key);
  if (cached !== undefined) return cached;
  const animated = parseImageDataUrl(dataUrl)?.animated ?? false;
  animatedCache.set(key, animated);
  return animated;
}
