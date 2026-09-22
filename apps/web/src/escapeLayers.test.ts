import assert from 'node:assert/strict';
import { test } from 'node:test';

// O módulo só precisa de window.addEventListener; um window de mentira basta para exercitar a pilha.
let listener: ((event: unknown) => void) | null = null;
(globalThis as unknown as { window: unknown }).window = {
  addEventListener: (_type: string, fn: (event: unknown) => void) => {
    listener = fn;
  },
};

const { escapeLayerCount, pushEscapeLayer } = await import('./escapeLayers');

function press(overrides: Record<string, unknown> = {}) {
  const event = { key: 'Escape', defaultPrevented: false, isComposing: false, stopped: false, stopPropagation() { this.stopped = true; }, ...overrides };
  listener?.(event);
  return event;
}

test('o Esc só chega à camada do topo e cada Esc fecha uma camada por vez', () => {
  const calls: string[] = [];
  const closeSettings = pushEscapeLayer(() => { calls.push('configurações'); closeSettings(); });
  const closeDialog = pushEscapeLayer(() => { calls.push('diálogo'); closeDialog(); });
  assert.equal(escapeLayerCount(), 2);

  const first = press();
  assert.deepEqual(calls, ['diálogo']);
  assert.equal(first.stopped, true);
  press();
  assert.deepEqual(calls, ['diálogo', 'configurações']);
  assert.equal(escapeLayerCount(), 0);

  // sem camadas abertas o Esc passa direto (não é consumido)
  const none = press();
  assert.equal(none.stopped, false);
});

test('outras teclas, Esc já tratado por um campo e Esc durante composição de texto não fecham nada', () => {
  let closed = 0;
  const remove = pushEscapeLayer(() => { closed += 1; });
  press({ key: 'Enter' });
  press({ defaultPrevented: true });
  press({ isComposing: true });
  assert.equal(closed, 0);
  press();
  assert.equal(closed, 1);
  remove();
  assert.equal(escapeLayerCount(), 0);
});

test('uma camada que sai por outro caminho deixa a pilha coerente', () => {
  const calls: string[] = [];
  const removeA = pushEscapeLayer(() => calls.push('a'));
  const removeB = pushEscapeLayer(() => calls.push('b'));
  removeA(); // a de baixo fechou por clique fora
  press();
  assert.deepEqual(calls, ['b']);
  removeB();
  removeB(); // remover duas vezes não estraga nada
  assert.equal(escapeLayerCount(), 0);
});
