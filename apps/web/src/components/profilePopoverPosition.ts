export const POPOVER_WIDTH = 300;
export const POPOVER_MARGIN = 12;
const ANCHOR_GAP = 8;

interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
}

interface Size {
  width: number;
  height: number;
}

// Posiciona o popover a partir da altura REAL medida depois de montar — a
// versão anterior estimava 260 px, e o cartão mede 330 px mesmo no perfil mais
// curto, então vazava pela borda inferior da janela.
//
// Prefere abrir abaixo do elemento clicado; se não couber, tenta acima; se
// também não couber (janela baixa), encosta na borda inferior com a margem, de
// modo que o topo do cartão continue visível.
export function computePopoverPosition(
  anchor: AnchorRect,
  popover: Size,
  viewport: Size,
): { top: number; left: number } {
  let left = anchor.left;
  if (left + popover.width + POPOVER_MARGIN > viewport.width) {
    left = Math.max(POPOVER_MARGIN, viewport.width - popover.width - POPOVER_MARGIN);
  }

  let top = anchor.bottom + ANCHOR_GAP;
  if (top + popover.height + POPOVER_MARGIN > viewport.height) {
    const above = anchor.top - popover.height - ANCHOR_GAP;
    top = above >= POPOVER_MARGIN ? above : Math.max(POPOVER_MARGIN, viewport.height - popover.height - POPOVER_MARGIN);
  }

  return { top, left };
}
