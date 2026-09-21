// Mantém a variável --fill (0 a 1) de todo <input type="range"> em dia, para o trilho mostrar o quanto está preenchido.
function sync(input: HTMLInputElement): void {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const span = max - min;
  input.style.setProperty('--fill', String(span > 0 ? Math.min(1, Math.max(0, (Number(input.value) - min) / span)) : 0));
}

function syncWithin(root: ParentNode): void {
  root.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(sync);
}

export function installRangeFill(): void {
  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === 'range') sync(target);
  }, true);
  new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLInputElement && node.type === 'range') sync(node);
        else if (node instanceof HTMLElement) syncWithin(node);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
  syncWithin(document);
}
