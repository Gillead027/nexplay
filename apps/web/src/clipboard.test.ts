/// <reference types="node" />

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { copyText } from './clipboard.js';

interface FakeField {
  value: string;
  style: Record<string, string>;
  attributes: Record<string, string>;
  focused: boolean;
  selected: boolean;
  setAttribute(name: string, value: string): void;
  focus(): void;
  select(): void;
  setSelectionRange(start: number, end: number): void;
}

const globals = globalThis as unknown as Record<string, unknown>;
const original = { navigator: globals.navigator, document: globals.document, HTMLElement: globals.HTMLElement };

let execCalls: string[];
let appended: FakeField[];
let removed: FakeField[];
let execResult: boolean | 'throw';
let previouslyFocusedRefocused: boolean;

function installFakes(writeText: ((text: string) => Promise<void>) | undefined) {
  execCalls = [];
  appended = [];
  removed = [];
  execResult = true;
  previouslyFocusedRefocused = false;

  class FakeHTMLElement {
    focus() {
      previouslyFocusedRefocused = true;
    }
  }
  globals.HTMLElement = FakeHTMLElement;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: writeText ? { clipboard: { writeText } } : {},
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      activeElement: new FakeHTMLElement(),
      body: {
        appendChild: (field: FakeField) => appended.push(field),
        removeChild: (field: FakeField) => removed.push(field),
      },
      createElement: (): FakeField => ({
        value: '',
        style: {},
        attributes: {},
        focused: false,
        selected: false,
        setAttribute(name, value) { this.attributes[name] = value; },
        focus() { this.focused = true; },
        select() { this.selected = true; },
        setSelectionRange() {},
      }),
      execCommand: (command: string) => {
        execCalls.push(command);
        if (execResult === 'throw') throw new Error('execCommand indisponível');
        return execResult;
      },
    },
  });
}

beforeEach(() => installFakes(async () => {}));

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: original.navigator });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: original.document });
  globals.HTMLElement = original.HTMLElement;
});

describe('copyText', () => {
  it('usa a API moderna quando ela funciona, sem tocar no documento', async () => {
    const written: string[] = [];
    installFakes(async (text) => { written.push(text); });

    assert.equal(await copyText('olá'), true);
    assert.deepEqual(written, ['olá']);
    assert.equal(appended.length, 0);
    assert.deepEqual(execCalls, []);
  });

  it('cai para execCommand quando a permissão é negada, como no Electron do NexPlay', async () => {
    installFakes(async () => {
      throw new DOMException('Write permission denied.', 'NotAllowedError');
    });

    assert.equal(await copyText('texto do desktop'), true);
    assert.deepEqual(execCalls, ['copy']);
    assert.equal(appended.length, 1);
    assert.equal(appended[0]?.value, 'texto do desktop');
    assert.equal(appended[0]?.selected, true);
  });

  it('cai para execCommand quando a API nem existe', async () => {
    installFakes(undefined);
    assert.equal(await copyText('sem api'), true);
    assert.deepEqual(execCalls, ['copy']);
  });

  it('remove o campo temporário e devolve o foco, com sucesso ou não', async () => {
    installFakes(async () => { throw new Error('negado'); });
    execResult = false;

    assert.equal(await copyText('x'), false);
    assert.equal(removed.length, 1);
    assert.equal(removed[0], appended[0]);
    assert.equal(previouslyFocusedRefocused, true);
  });

  it('devolve false, sem lançar, quando os dois caminhos falham', async () => {
    installFakes(async () => { throw new Error('negado'); });
    execResult = 'throw';

    assert.equal(await copyText('nada funciona'), false);
    assert.equal(removed.length, 1);
  });

  it('esconde o campo fora da tela e somente leitura, pra não piscar nem abrir teclado', async () => {
    installFakes(undefined);
    await copyText('abc');
    const field = appended[0];
    assert.ok(field);
    assert.equal(field.attributes.readonly, '');
    assert.equal(field.style.position, 'fixed');
    assert.equal(field.style.left, '-9999px');
    assert.equal(field.style.opacity, '0');
  });
});
