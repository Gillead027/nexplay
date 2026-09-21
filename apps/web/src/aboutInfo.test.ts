import assert from 'node:assert/strict';
import test from 'node:test';
import { describeApp, describeBuild, parseDesktopVersion, parseEngineVersion, versionSummary } from './aboutInfo';

const ELECTRON_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) NexPlay/0.2.11 Chrome/152.0.7977.76 Electron/44.2.0 Safari/537.36';
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const SAMSUNG_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36';

test('acha a versão do app desktop no user agent', () => {
  assert.equal(parseDesktopVersion(ELECTRON_UA), '0.2.11');
});

test('navegador comum não é confundido com o app desktop', () => {
  assert.equal(parseDesktopVersion(CHROME_UA), null);
  assert.equal(parseDesktopVersion(SAMSUNG_UA), null);
  assert.equal(parseDesktopVersion(''), null);
});

test('acha a versão do Chromium', () => {
  assert.equal(parseEngineVersion(ELECTRON_UA), '152');
  assert.equal(parseEngineVersion('sem chrome'), null);
});

test('descreve o app pelo que ele realmente é', () => {
  assert.equal(describeApp(false, null), 'Navegador (sem o aplicativo instalado)');
  assert.equal(describeApp(true, '0.2.11'), 'Aplicativo para Windows 0.2.11');
  assert.match(describeApp(true, null), /versão não identificada/);
});

test('descreve a versão da web, e não finge que o modo de desenvolvimento é uma versão', () => {
  const format = (iso: string) => `em ${iso.slice(0, 10)}`;
  assert.equal(describeBuild({ commit: 'a1b2c3d', builtAt: '2026-09-21T04:10:00Z' }, format), 'a1b2c3d, gerada em em 2026-09-21');
  assert.equal(describeBuild({ commit: 'a1b2c3d', builtAt: null }, format), 'a1b2c3d');
  assert.match(describeBuild({ commit: 'desenvolvimento', builtAt: null }, format), /não é uma versão publicada/);
});

test('o resumo copiável junta app, web e Chromium', () => {
  const summary = versionSummary({
    desktop: true,
    desktopVersion: '0.2.11',
    build: { commit: 'a1b2c3d', builtAt: '2026-09-21T04:10:00Z' },
    engineVersion: '152',
  });
  assert.equal(summary, 'NexPlay — Aplicativo para Windows 0.2.11 · web a1b2c3d (2026-09-21T04:10:00Z) · Chromium 152');
  assert.equal(
    versionSummary({ desktop: false, desktopVersion: null, build: { commit: 'x', builtAt: null }, engineVersion: null }),
    'NexPlay — Navegador (sem o aplicativo instalado) · web x',
  );
});
