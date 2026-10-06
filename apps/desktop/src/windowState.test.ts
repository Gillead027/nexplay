import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWindowState,
  serializeWindowState,
  isPositionVisible,
  DEFAULT_WINDOW_STATE,
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
} from './windowState.js';

describe('parseWindowState', () => {
  it('sem dado ou lixo cai no padrão', () => {
    assert.deepEqual(parseWindowState(null), DEFAULT_WINDOW_STATE);
    assert.deepEqual(parseWindowState(''), DEFAULT_WINDOW_STATE);
    assert.deepEqual(parseWindowState('nao é json'), DEFAULT_WINDOW_STATE);
    assert.deepEqual(parseWindowState('123'), DEFAULT_WINDOW_STATE);
  });

  it('lê tamanho, posição e maximizado válidos', () => {
    const s = parseWindowState(JSON.stringify({ width: 1600, height: 1000, x: 10, y: 20, maximized: true }));
    assert.deepEqual(s, { width: 1600, height: 1000, x: 10, y: 20, maximized: true });
  });

  it('nunca abre menor que o mínimo', () => {
    const s = parseWindowState(JSON.stringify({ width: 400, height: 300, maximized: false }));
    assert.equal(s.width, MIN_WINDOW_WIDTH);
    assert.equal(s.height, MIN_WINDOW_HEIGHT);
  });

  it('x/y só valem juntos; faltando um, abre centralizado (sem x/y)', () => {
    const s = parseWindowState(JSON.stringify({ width: 1440, height: 900, x: 10, maximized: false }));
    assert.equal(s.x, undefined);
    assert.equal(s.y, undefined);
  });

  it('ignora x/y que não são número', () => {
    const s = parseWindowState(JSON.stringify({ width: 1440, height: 900, x: 'a', y: 'b', maximized: false }));
    assert.equal(s.x, undefined);
    assert.equal(s.y, undefined);
  });

  it('maximized não-booleano vira false', () => {
    const s = parseWindowState(JSON.stringify({ width: 1440, height: 900, maximized: 'sim' }));
    assert.equal(s.maximized, false);
  });
});

describe('serializeWindowState', () => {
  it('arredonda, aplica o mínimo e preserva x/y juntos', () => {
    const raw = serializeWindowState({ width: 1500.6, height: 950.2, x: 5.9, y: 7.1, maximized: true });
    assert.deepEqual(JSON.parse(raw), { width: 1501, height: 950, maximized: true, x: 6, y: 7 });
  });

  it('ida e volta é estável', () => {
    const original = { width: 1600, height: 1000, x: 100, y: 50, maximized: false };
    assert.deepEqual(parseWindowState(serializeWindowState(original)), original);
  });
});

describe('isPositionVisible', () => {
  const display = { x: 0, y: 0, width: 1920, height: 1040 };

  it('janela dentro do monitor é visível', () => {
    assert.equal(isPositionVisible({ x: 100, y: 100, width: 1440, height: 900 }, [display]), true);
  });

  it('janela num monitor que sumiu não é visível', () => {
    // salva num segundo monitor à direita que não existe mais
    assert.equal(isPositionVisible({ x: 3000, y: 100, width: 1440, height: 900 }, [display]), false);
  });

  it('um cantinho de fora ainda conta se sobra margem suficiente', () => {
    assert.equal(isPositionVisible({ x: -50, y: 0, width: 1440, height: 900 }, [display]), true);
  });

  it('quase toda fora da tela não conta', () => {
    assert.equal(isPositionVisible({ x: 1900, y: 0, width: 1440, height: 900 }, [display]), false);
  });
});
