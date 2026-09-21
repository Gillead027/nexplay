import assert from 'node:assert/strict';
import test from 'node:test';
import { entryScriptOf, isNewVersion } from './appVersion.js';

const page = (script: string) => `<!doctype html><html><head><title>NexPlay</title>
  <script type="module" crossorigin src="${script}"></script>
  <link rel="modulepreload" crossorigin href="/assets/rolldown-runtime-CbXtAM7H.js">
  <link rel="stylesheet" crossorigin href="/assets/index-CGi03--4.css"></head><body><div id="root"></div></body></html>`;

test('acha o script principal na página, em qualquer ordem dos atributos', () => {
  assert.equal(entryScriptOf(page('/assets/index-C5lOborn.js')), '/assets/index-C5lOborn.js');
  assert.equal(entryScriptOf('<script src="/assets/index-Ab_9-x.js" type="module"></script>'), '/assets/index-Ab_9-x.js');
  assert.equal(entryScriptOf(page('https://exemplo.com/assets/index-XYZ.js')), '/assets/index-XYZ.js');
});

test('página sem o script principal (ou o css e os preloads) não conta', () => {
  assert.equal(entryScriptOf('<html><body>fora do ar</body></html>'), null);
  assert.equal(entryScriptOf('<link rel="stylesheet" href="/assets/index-CGi03--4.css">'), null);
});

test('só avisa quando o script mudou e a pessoa ainda não dispensou essa versão', () => {
  assert.equal(isNewVersion('/assets/index-A.js', '/assets/index-A.js', null), false);
  assert.equal(isNewVersion('/assets/index-A.js', '/assets/index-B.js', null), true);
  assert.equal(isNewVersion('/assets/index-A.js', '/assets/index-B.js', '/assets/index-B.js'), false);
  // outra publicação depois de dispensar volta a avisar
  assert.equal(isNewVersion('/assets/index-A.js', '/assets/index-C.js', '/assets/index-B.js'), true);
});

test('em desenvolvimento (sem script com hash) ou sem resposta, não avisa nada', () => {
  assert.equal(isNewVersion(null, '/assets/index-B.js', null), false);
  assert.equal(isNewVersion('/assets/index-A.js', null, null), false);
});
