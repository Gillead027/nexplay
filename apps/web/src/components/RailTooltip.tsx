import { useCallback, useState, type FocusEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';

interface TooltipState {
  text: string;
  top: number;
  left: number;
}

// Balão com o nome do servidor ao passar o mouse (ou focar pelo teclado) num ícone da barra de servidores, como no
// Discord: escuro, com setinha, à direita do ícone. Os botões dizem o texto em data-tooltip.
export function useRailTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const show = useCallback((target: EventTarget | null) => {
    const element = target instanceof Element ? target.closest<HTMLElement>('[data-tooltip]') : null;
    const text = element?.dataset.tooltip;
    if (!element || !text) {
      setTooltip(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    setTooltip((current) => {
      const next = { text, top: rect.top + rect.height / 2, left: rect.right + 16 };
      return current && current.text === next.text && current.top === next.top ? current : next;
    });
  }, []);

  const hide = useCallback(() => setTooltip(null), []);

  const handlers = {
    onMouseOver: (event: MouseEvent<HTMLElement>) => show(event.target),
    onMouseLeave: hide,
    onFocus: (event: FocusEvent<HTMLElement>) => show(event.target),
    onBlur: hide,
    // Arrastar ou rolar a barra tira o balão do lugar: some até o próximo hover.
    onScroll: hide,
    onDragStart: hide,
  };

  const element = tooltip
    ? createPortal(
        <div className="rail-tooltip" role="tooltip" style={{ top: tooltip.top, left: tooltip.left }} key={tooltip.text}>
          {tooltip.text}
        </div>,
        document.body,
      )
    : null;

  return { handlers, element };
}
