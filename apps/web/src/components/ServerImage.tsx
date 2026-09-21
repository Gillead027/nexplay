import { useEffect, useState } from 'react';

const stillFrames = new Map<string, string>();

// Modo leve e "reduzir movimento" do sistema: nada de ícone se mexendo.
function motionAllowed(): boolean {
  if (document.documentElement.getAttribute('data-perf') === 'lite') return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// O primeiro quadro de uma imagem animada, para ela ficar parada até o mouse chegar (como no Discord).
function useStillFrame(src: string, enabled: boolean): string | undefined {
  const [still, setStill] = useState<string | undefined>(() => stillFrames.get(src));
  useEffect(() => {
    if (!enabled) return undefined;
    const cached = stillFrames.get(src);
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
        stillFrames.set(src, frame);
        setStill(frame);
      } catch {
        // Sem como ler o quadro: a imagem continua como veio.
      }
    };
    image.src = src;
    return () => {
      active = false;
    };
  }, [src, enabled]);
  return still;
}

/**
 * O ícone ou o painel de um servidor: a imagem por inteiro (sem esticar). Se for animada, só se mexe quando `playing`
 * (o mouse está em cima, ou é uma tela onde ela deve animar); parada, mostra o primeiro quadro. `src` é a URL da
 * imagem (ou uma data: URL, ainda não enviada).
 */
export function ServerImage({ src, animated, playing = false, className }: { src: string; animated: boolean; playing?: boolean; className?: string }) {
  const shouldFreeze = animated && !(playing && motionAllowed());
  const still = useStillFrame(src, shouldFreeze);
  return <img className={className} src={shouldFreeze ? (still ?? src) : src} alt="" draggable={false} />;
}
