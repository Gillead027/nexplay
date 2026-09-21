import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { externalWebUrl, findDeepLink, isAllowedPermission, parseDeepLink } from './policy.js';

describe('permissões da janela principal', () => {
  it('libera as que o app usa, incluindo a escrita na área de transferência', () => {
    for (const permission of ['media', 'fullscreen', 'automatic-fullscreen', 'display-capture', 'speaker-selection', 'clipboard-sanitized-write']) {
      assert.equal(isAllowedPermission(permission), true, permission);
    }
  });

  it('continua negando leitura da área de transferência, notificações e o resto', () => {
    for (const permission of ['clipboard-read', 'notifications', 'geolocation', 'midi', 'openExternal', 'pointerLock', 'window-management', '']) {
      assert.equal(isAllowedPermission(permission), false, permission);
    }
  });
});

describe('links que podem abrir no navegador do sistema', () => {
  it('aceita http e https e devolve a URL normalizada', () => {
    assert.equal(externalWebUrl('https://example.com/teste'), 'https://example.com/teste');
    assert.equal(externalWebUrl('http://example.com'), 'http://example.com/');
    assert.equal(externalWebUrl('https://exemplo.com.br/a b?x=1#y'), 'https://exemplo.com.br/a%20b?x=1#y');
  });

  it('recusa esquemas que o sistema executaria de verdade', () => {
    for (const url of [
      'file:///C:/Windows/System32/calc.exe',
      'javascript:alert(1)',
      'ms-settings:privacy-microphone',
      'ms-msdt:/id PCWDiagnostic',
      'vscode://file/C:/segredo.txt',
      'data:text/html,<script>alert(1)</script>',
      'mailto:alguem@example.com',
      'nexplay://invite/abc',
      'ftp://example.com/arquivo',
    ]) {
      assert.equal(externalWebUrl(url), null, url);
    }
  });

  it('recusa usuário e senha embutidos e endereços sem host', () => {
    assert.equal(externalWebUrl('https://usuario:senha@example.com/'), null);
    assert.equal(externalWebUrl('https://usuario@example.com/'), null);
    assert.equal(externalWebUrl('https://'), null);
    assert.equal(externalWebUrl('http://'), null);
  });

  it('trata barras a mais como o navegador: https:///x é o host x, um endereço válido', () => {
    assert.equal(externalWebUrl('https:///sem-host'), 'https://sem-host/');
  });

  it('recusa lixo, vazio e URLs gigantes', () => {
    assert.equal(externalWebUrl(''), null);
    assert.equal(externalWebUrl('não é uma url'), null);
    assert.equal(externalWebUrl('example.com'), null);
    assert.equal(externalWebUrl('https://example.com/' + 'a'.repeat(5_000)), null);
    assert.equal(externalWebUrl(undefined as unknown as string), null);
  });
});

describe('links nexplay:// que abrem o app', () => {
  it('aceita só nexplay://convite/<código> e devolve o link reescrito', () => {
    assert.equal(parseDeepLink('nexplay://convite/6U8JDJU3'), 'nexplay://convite/6U8JDJU3');
    assert.equal(parseDeepLink('nexplay://convite/6U8JDJU3/'), 'nexplay://convite/6U8JDJU3');
    assert.equal(parseDeepLink('  nexplay://convite/ab-cd_12  '), 'nexplay://convite/ab-cd_12');
  });

  it('recusa qualquer outro formato, esquema ou caminho', () => {
    for (const bad of [
      '', 'nexplay://', 'nexplay://convite/', 'nexplay://convite/abc', 'nexplay://convite/6U8JDJU3/extra',
      'nexplay://canal/6U8JDJU3', 'nexplay://convite/6U8JDJU3?x=1', 'nexplay://convite/../etc',
      'http://convite/6U8JDJU3', 'https://exemplo.com/convite/6U8JDJU3', 'javascript:alert(1)', 'file:///C:/x',
      'nexplay://convite/6U8JDJU3 --flag', 'nexplay://convite/' + 'A'.repeat(200),
    ]) {
      assert.equal(parseDeepLink(bad), null, bad);
    }
  });

  it('acha o link entre os argumentos da linha de comando e ignora o resto', () => {
    assert.equal(findDeepLink(['C:/Program Files/NexPlay/NexPlay.exe', '--flag', 'nexplay://convite/6U8JDJU3']), 'nexplay://convite/6U8JDJU3');
    assert.equal(findDeepLink(['NexPlay.exe', '--user-data-dir=C:/x']), null);
    assert.equal(findDeepLink([]), null);
  });
});
