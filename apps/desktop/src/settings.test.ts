import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_DESKTOP_SETTINGS,
  HIDDEN_LAUNCH_ARGUMENT,
  parseDesktopSettings,
  sanitizeSettingsPatch,
  shouldHideOnClose,
  shouldStartHidden,
} from './settings';

test('sem arquivo ou com arquivo estragado, valem os padrões (X esconde na bandeja, não abre com o Windows)', () => {
  assert.deepEqual(parseDesktopSettings(null), DEFAULT_DESKTOP_SETTINGS);
  assert.deepEqual(parseDesktopSettings(''), DEFAULT_DESKTOP_SETTINGS);
  assert.deepEqual(parseDesktopSettings('{não é json'), DEFAULT_DESKTOP_SETTINGS);
  assert.equal(DEFAULT_DESKTOP_SETTINGS.closeToTray, true);
  assert.equal(DEFAULT_DESKTOP_SETTINGS.launchAtLogin, false);
});

test('cada opção é lida sozinha, e valor que não é verdadeiro/falso cai no padrão daquela opção', () => {
  assert.deepEqual(parseDesktopSettings('{"closeToTray":false,"launchAtLogin":true}'), {
    closeToTray: false, launchAtLogin: true, startMinimized: true, globalMuteHotkey: '', globalDeafenHotkey: '',
  });
  assert.deepEqual(parseDesktopSettings('{"closeToTray":"não","startMinimized":0}'), DEFAULT_DESKTOP_SETTINGS);
});

test('atalho global é lido como texto; valor que não é texto cai no padrão (desativado)', () => {
  assert.deepEqual(parseDesktopSettings('{"globalMuteHotkey":"Control+Shift+M"}'), { ...DEFAULT_DESKTOP_SETTINGS, globalMuteHotkey: 'Control+Shift+M' });
  assert.deepEqual(parseDesktopSettings('{"globalMuteHotkey":123}'), DEFAULT_DESKTOP_SETTINGS);
});

test('o que a página pode mudar: só as cinco opções, cada uma com o tipo certo', () => {
  assert.deepEqual(sanitizeSettingsPatch({ closeToTray: false }), { closeToTray: false });
  assert.deepEqual(sanitizeSettingsPatch({ launchAtLogin: true, startMinimized: false }), { launchAtLogin: true, startMinimized: false });
  assert.deepEqual(sanitizeSettingsPatch({ globalMuteHotkey: 'F13' }), { globalMuteHotkey: 'F13' });
  assert.deepEqual(sanitizeSettingsPatch({}), {});
  assert.deepEqual(sanitizeSettingsPatch({ inventada: true, closeToTray: true }), { closeToTray: true });
  assert.equal(sanitizeSettingsPatch({ closeToTray: 'sim' }), null);
  assert.equal(sanitizeSettingsPatch({ globalMuteHotkey: true }), null);
  assert.equal(sanitizeSettingsPatch(null), null);
  assert.equal(sanitizeSettingsPatch([true]), null);
  assert.equal(sanitizeSettingsPatch('closeToTray'), null);
});

test('o X só esconde o app quando a pessoa quer, a bandeja existe e o app não está encerrando', () => {
  const on = { ...DEFAULT_DESKTOP_SETTINGS, closeToTray: true };
  assert.equal(shouldHideOnClose(on, true, false), true);
  assert.equal(shouldHideOnClose({ ...on, closeToTray: false }, true, false), false);
  assert.equal(shouldHideOnClose(on, false, false), false, 'sem bandeja o X fecha o app');
  assert.equal(shouldHideOnClose(on, true, true), false, 'encerrando: fecha de verdade');
});

test('aberto sozinho pelo Windows fica na bandeja, mas só se a pessoa quer e a bandeja existe', () => {
  const settings = { ...DEFAULT_DESKTOP_SETTINGS, launchAtLogin: true, startMinimized: true };
  assert.equal(shouldStartHidden(['NexPlay.exe', HIDDEN_LAUNCH_ARGUMENT], settings, true), true);
  assert.equal(shouldStartHidden(['NexPlay.exe'], settings, true), false, 'aberto pela pessoa: mostra a janela');
  assert.equal(shouldStartHidden(['NexPlay.exe', HIDDEN_LAUNCH_ARGUMENT], { ...settings, startMinimized: false }, true), false);
  assert.equal(shouldStartHidden(['NexPlay.exe', HIDDEN_LAUNCH_ARGUMENT], settings, false), false);
});
