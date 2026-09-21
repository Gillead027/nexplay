import assert from 'node:assert/strict';
import test from 'node:test';
import { deviceAddedMessage, deviceLostMessage, diffDevices, selectionLost } from './deviceChanges';

const mic = (deviceId: string, label = deviceId) => ({ deviceId, label });

test('na primeira leitura da lista nada é novo nem removido', () => {
  assert.deepEqual(diffDevices(null, [mic('a'), mic('b')]), { added: [], removed: [] });
});

test('lista anterior sem ids (permissão ainda não dada) não vira uma enxurrada de aparelhos novos', () => {
  assert.deepEqual(diffDevices([mic('', ''), mic('', '')], [mic('a'), mic('b')]), { added: [], removed: [] });
});

test('acha o aparelho que entrou e o que saiu', () => {
  const diff = diffDevices([mic('a'), mic('b')], [mic('b'), mic('c', 'Headset')]);
  assert.deepEqual(diff.added, [mic('c', 'Headset')]);
  assert.deepEqual(diff.removed, [mic('a')]);
});

test('"default" e "communications" nunca contam como aparelho novo ou removido', () => {
  const diff = diffDevices([mic('default'), mic('a')], [mic('communications'), mic('a')]);
  assert.deepEqual(diff, { added: [], removed: [] });
});

test('a escolha some da lista: perdeu; ainda existe: não perdeu', () => {
  assert.equal(selectionLost('a', [mic('b'), mic('default')]), true);
  assert.equal(selectionLost('a', [mic('a'), mic('b')]), false);
});

test('"default" nunca é considerado perdido', () => {
  assert.equal(selectionLost('default', [mic('a')]), false);
});

test('sem permissão (lista sem ids) não dá pra afirmar que sumiu', () => {
  assert.equal(selectionLost('a', [mic('', ''), mic('', '')]), false);
  assert.equal(selectionLost('a', []), false);
});

test('as mensagens dizem o que aconteceu e o que fazer', () => {
  assert.match(deviceLostMessage('audioinput'), /microfone escolhido foi desconectado.*padrão/);
  assert.match(deviceLostMessage('audiooutput'), /saída de áudio escolhida/);
  assert.match(deviceLostMessage('videoinput'), /câmera escolhida/);
  assert.match(deviceAddedMessage('audioinput', mic('c', 'Headset USB')), /“Headset USB” foi conectado \(microfone\).*Voz e vídeo/);
  assert.match(deviceAddedMessage('videoinput', mic('c', '')), /Um novo dispositivo foi conectado \(câmera\)/);
});
