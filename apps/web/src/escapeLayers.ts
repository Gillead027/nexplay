import { useEffect, useRef } from 'react';

// Pilha de "camadas" que reagem ao Esc (menus, cartões de perfil, janelas de configuração, diálogos...). Cada camada aberta
// entra no topo da pilha e sai quando fecha; um Esc só chega à camada do topo, então diálogo por cima de configurações fecha
// só o diálogo, e não as duas de uma vez. Quem já tratou o Esc por conta própria (um campo de edição, por exemplo) chama
// preventDefault e a pilha não faz nada.

interface Layer {
  handler: () => void;
}

const stack: Layer[] = [];
let listening = false;

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  // O Esc foi consumido por esta camada; nenhum outro ouvinte do window precisa reagir a ele.
  event.stopPropagation();
  top.handler();
}

export function pushEscapeLayer(handler: () => void): () => void {
  const layer: Layer = { handler };
  stack.push(layer);
  if (!listening) {
    listening = true;
    // Fase de captura: a camada do topo vê o Esc antes de qualquer ouvinte antigo que ainda escute o window.
    window.addEventListener('keydown', handleKeyDown, true);
  }
  return () => {
    const index = stack.indexOf(layer);
    if (index >= 0) stack.splice(index, 1);
  };
}

/** Quantas camadas estão abertas agora (usado nos testes). */
export function escapeLayerCount(): number {
  return stack.length;
}

/**
 * Registra uma camada que reage ao Esc enquanto `active` for verdadeiro. `onEscape` pode mudar a cada renderização sem
 * perder o lugar na pilha (a camada só é reposicionada quando `active` liga e desliga).
 */
export function useEscapeLayer(active: boolean, onEscape: () => void): void {
  const handlerRef = useRef(onEscape);
  useEffect(() => {
    handlerRef.current = onEscape;
  });
  useEffect(() => {
    if (!active) return undefined;
    return pushEscapeLayer(() => handlerRef.current());
  }, [active]);
}
