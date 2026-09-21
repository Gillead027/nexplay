import assert from 'node:assert/strict';
import test from 'node:test';
import { describeMediaError, isPermissionDenied } from './mediaAccess';

const denied = () => new DOMException('Permission denied', 'NotAllowedError');

test('reconhece a permissão negada pelo nome ou pela mensagem', () => {
  assert.equal(isPermissionDenied(denied()), true);
  assert.equal(isPermissionDenied(new Error('Permission denied by system')), true);
  assert.equal(isPermissionDenied(new DOMException('x', 'NotFoundError')), false);
  assert.equal(isPermissionDenied('outra coisa'), false);
});

test('captura de tela negada explica que nenhuma transmissão foi criada e diz onde conferir', async () => {
  const message = await describeMediaError(denied(), 'screen');
  assert.match(message, /nenhuma transmissão foi iniciada/);
  assert.match(message, /Privacidade e segurança/);
});

test('microfone negado sem diagnóstico nativo cai no aviso de permissão', async () => {
  const message = await describeMediaError(denied(), 'microphone');
  assert.match(message, /Permissão do microfone negada/);
});

test('erro que não é de permissão mantém a mensagem própria', async () => {
  assert.equal(await describeMediaError(new DOMException('x', 'NotFoundError'), 'camera'), 'Nenhum dispositivo compatível foi encontrado.');
  assert.equal(await describeMediaError(new DOMException('x', 'NotReadableError')), 'O dispositivo está sendo usado por outro aplicativo.');
});
