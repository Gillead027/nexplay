import { useEffect, useState } from 'react';
import { dataUrlIsAnimated } from '../iconImage';

const stillFrames = new Map<string, string>();

// Modo leve e "reduzir movimento" do sistema: nada de ícone se mexendo.
function motionAllowed(): boolean {
  if (document.documentElement.getAttribute('data-perf') === 'lite') return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// O primeiro quadro de um ícone animado, para a barra de servidores ficar parada até o mouse chegar (como no Discord).
function useStillFrame(dataUrl: string, enabled: boolean): string | undefined {
  const key = `${dataUrl.length}:${dataUrl.slice(-48)}`;
  const [still, setStill] = useState<string | undefined>(() => stillFrames.get(key));
  useEffect(() => {
    if (!enabled) return undefined;
    const cached = stillFrames.get(key);
    if (cached) {
      setStill(cached);
      return undefined;
    }
    let active = true;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || 1;
      canvas.height = image.naturalHeight || 1;
      const context = canvas.getContext('2d');
      if (!context || !active) return;
      context.drawImage(image, 0, 0);
      try {
        const frame = canvas.toDataURL('image/png');
        stillFrames.set(key, frame);
        setStill(frame);
      } catch {
        // Sem como ler o quadro: o ícone continua como veio.
      }
    };
    image.src = dataUrl;
    return () => {
      active = false;
    };
  }, [dataUrl, enabled, key]);
  return still;
}

/**
 * O ícone de um servidor: a imagem inteira dentro do quadrado, sem cortar nem esticar. Se for animado, só se mexe quando
 * `playing` (o mouse está em cima, ou é a tela de configurações); parado, mostra o primeiro quadro.
 */
export function ServerIcon({ dataUrl, playing = false, className }: { dataUrl: string; playing?: boolean; className?: string }) {
  const animated = dataUrlIsAnimated(dataUrl);
  const shouldFreeze = animated && !(playing && motionAllowed());
  const still = useStillFrame(dataUrl, shouldFreeze);
  return <img className={className} src={shouldFreeze ? (still ?? dataUrl) : dataUrl} alt="" draggable={false} />;
}
