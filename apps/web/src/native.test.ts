import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { nativeSupports } from './native';

const globalWithWindow = globalThis as unknown as { window?: unknown };

afterEach(() => {
  delete globalWithWindow.window;
});

test('no navegador nenhum recurso nativo existe', () => {
  globalWithWindow.window = {};
  assert.equal(nativeSupports('updates'), false);
  assert.equal(nativeSupports('screenPicker'), false);
});

test('app novo (ponte NexplayNative) tem todos os recursos', () => {
  globalWithWindow.window = { NexplayNative: {} };
  assert.equal(nativeSupports('updates'), true);
  assert.equal(nativeSupports('globalHotkeys'), true);
  assert.equal(nativeSupports('desktopSettings'), true);
});

test('app antigo (ponte legada) só tem o que a versão dele trouxe', () => {
  // Um app 0.2.12: tem verificar atualizações e logs, mas não as configurações do app (0.2.17) nem os atalhos (0.2.18).
  globalWithWindow.window = {
    desktop: {
      chooseShareSource: () => Promise.resolve(null),
      setFullscreen: () => Promise.resolve(false),
      checkForUpdates: () => Promise.resolve(undefined),
      openLogs: () => Promise.resolve(true),
    },
  };
  assert.equal(nativeSupports('screenPicker'), true);
  assert.equal(nativeSupports('fullscreen'), true);
  assert.equal(nativeSupports('updates'), true);
  assert.equal(nativeSupports('logs'), true);
  assert.equal(nativeSupports('desktopSettings'), false);
  assert.equal(nativeSupports('globalHotkeys'), false);
  assert.equal(nativeSupports('deepLink'), false);
});
