/// <reference types="node" />

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computePopoverPosition, POPOVER_MARGIN, POPOVER_WIDTH } from './profilePopoverPosition.js';

const popover = { width: POPOVER_WIDTH, height: 330 };

describe('posição do mini-perfil', () => {
  it('abre abaixo do elemento quando cabe', () => {
    const position = computePopoverPosition({ top: 100, bottom: 120, left: 50 }, popover, { width: 1280, height: 720 });
    assert.deepEqual(position, { top: 128, left: 50 });
  });

  it('abre acima quando abaixo não cabe mas acima cabe', () => {
    const position = computePopoverPosition({ top: 500, bottom: 520, left: 50 }, popover, { width: 1280, height: 720 });
    assert.equal(position.top, 500 - 330 - 8);
  });

  it('não vaza pela base na faixa em que a estimativa antiga de 260 px dizia que cabia', () => {
    // Caso medido no navegador: nome com bottom = 184, janela de 492 px de altura.
    // Com 260 px de altura estimada o cartão "cabia" (192 + 260 < 492), mas a
    // altura real de 330 px terminava em 522, 30 px abaixo da janela.
    const viewport = { width: 1280, height: 492 };
    const position = computePopoverPosition({ top: 160, bottom: 184, left: 378 }, popover, viewport);
    assert.ok(position.top + popover.height <= viewport.height - POPOVER_MARGIN, `terminaria em ${position.top + popover.height}`);
    assert.ok(position.top >= POPOVER_MARGIN);
  });

  it('encosta na borda inferior com margem quando nem abaixo nem acima cabem', () => {
    const viewport = { width: 1280, height: 400 };
    const position = computePopoverPosition({ top: 180, bottom: 200, left: 50 }, popover, viewport);
    assert.equal(position.top, 400 - 330 - POPOVER_MARGIN);
  });

  it('mantém o topo visível quando a janela é mais baixa que o cartão', () => {
    const position = computePopoverPosition({ top: 100, bottom: 120, left: 50 }, popover, { width: 1280, height: 200 });
    assert.equal(position.top, POPOVER_MARGIN);
  });

  it('recua da borda direita', () => {
    const position = computePopoverPosition({ top: 100, bottom: 120, left: 1200 }, popover, { width: 1280, height: 720 });
    assert.equal(position.left, 1280 - POPOVER_WIDTH - POPOVER_MARGIN);
  });

  it('respeita a margem esquerda numa janela mais estreita que o cartão', () => {
    const position = computePopoverPosition({ top: 100, bottom: 120, left: 5 }, popover, { width: 200, height: 720 });
    assert.equal(position.left, POPOVER_MARGIN);
  });
});
