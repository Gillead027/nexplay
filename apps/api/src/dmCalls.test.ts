import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DmCallRegistry, dmChannelIdFromRoom, dmRoomName } from './dmCalls.js';

const clock = (start = 1_000_000) => {
  let value = start;
  return { now: () => value, advance: (ms: number) => { value += ms; } };
};

test('ligar cria a ligação "chamando"; ligar de novo (mesma pessoa) só volta a ela', () => {
  const registry = new DmCallRegistry(45_000, clock().now);
  const first = registry.start('dm1', 'ana', 'bia');
  assert.ok(first.ok && first.created && first.call.status === 'ringing' && first.call.acceptedAt === null);
  const again = registry.start('dm1', 'ana', 'bia');
  assert.ok(again.ok && !again.created && again.call === first.call);
});

test('só quem foi chamado atende; ao atender a ligação fica em andamento e o tempo começa a contar', () => {
  const time = clock();
  const registry = new DmCallRegistry(45_000, time.now);
  registry.start('dm1', 'ana', 'bia');
  assert.deepEqual(registry.accept('dm1', 'ana'), { ok: false, reason: 'FORBIDDEN' });
  assert.deepEqual(registry.accept('dm1', 'caio'), { ok: false, reason: 'FORBIDDEN' });
  assert.deepEqual(registry.accept('nao-existe', 'bia'), { ok: false, reason: 'NOT_FOUND' });
  time.advance(8_000);
  const accepted = registry.accept('dm1', 'bia');
  assert.ok(accepted.ok && accepted.call.status === 'active');
  assert.equal(registry.elapsedMs(accepted.call!), 0);
  time.advance(65_000);
  assert.equal(registry.elapsedMs(registry.get('dm1')!), 65_000);
  assert.deepEqual(registry.accept('dm1', 'bia'), { ok: false, reason: 'ALREADY_ACTIVE' });
});

test('se os dois ligam ao mesmo tempo, a segunda ligada já atende a primeira', () => {
  const registry = new DmCallRegistry(45_000, clock().now);
  registry.start('dm1', 'ana', 'bia');
  const result = registry.start('dm1', 'bia', 'ana');
  assert.ok(result.ok && result.autoAccepted && result.call.status === 'active');
});

test('recusar tira a ligação; só quem foi chamado recusa, e só enquanto chama', () => {
  const registry = new DmCallRegistry(45_000, clock().now);
  registry.start('dm1', 'ana', 'bia');
  assert.deepEqual(registry.decline('dm1', 'ana'), { ok: false, reason: 'FORBIDDEN' });
  assert.ok(registry.decline('dm1', 'bia').ok);
  assert.equal(registry.get('dm1'), undefined);
  assert.deepEqual(registry.forUser('ana'), []);
  // com a ligação já em andamento não se "recusa": encerra
  registry.start('dm1', 'ana', 'bia');
  registry.accept('dm1', 'bia');
  assert.deepEqual(registry.decline('dm1', 'bia'), { ok: false, reason: 'FORBIDDEN' });
});

test('quem ligou desiste enquanto chama; quem foi chamado não "cancela" (recusa); em andamento qualquer um dos dois encerra', () => {
  const registry = new DmCallRegistry(45_000, clock().now);
  registry.start('dm1', 'ana', 'bia');
  assert.deepEqual(registry.end('dm1', 'bia'), { ok: false, reason: 'FORBIDDEN' });
  assert.deepEqual(registry.end('dm1', 'caio'), { ok: false, reason: 'FORBIDDEN' });
  assert.ok(registry.end('dm1', 'ana').ok);
  registry.start('dm2', 'ana', 'bia');
  registry.accept('dm2', 'bia');
  assert.ok(registry.end('dm2', 'bia').ok);
  assert.equal(registry.get('dm2'), undefined);
});

test('cada pessoa fica em uma ligação por vez: quem está ocupado não recebe nem faz outra', () => {
  const registry = new DmCallRegistry(45_000, clock().now);
  registry.start('dm1', 'ana', 'bia');
  assert.deepEqual(registry.start('dm2', 'ana', 'caio'), { ok: false, reason: 'CALLER_BUSY' });
  assert.deepEqual(registry.start('dm3', 'caio', 'bia'), { ok: false, reason: 'CALLEE_BUSY' });
  registry.end('dm1', 'ana');
  assert.ok(registry.start('dm2', 'ana', 'caio').ok);
});

test('depois do tempo de toque sem ninguém atender a ligação é perdida e sai; as atendidas não expiram', () => {
  const time = clock();
  const registry = new DmCallRegistry(45_000, time.now);
  registry.start('dm1', 'ana', 'bia');
  registry.start('dm2', 'caio', 'dora');
  registry.accept('dm2', 'dora');
  time.advance(44_000);
  assert.deepEqual(registry.expire(), []);
  time.advance(1_500);
  const expired = registry.expire();
  assert.deepEqual(expired.map((call) => call.dmChannelId), ['dm1']);
  assert.equal(registry.get('dm1'), undefined);
  assert.ok(registry.get('dm2'));
  assert.deepEqual(registry.forUser('ana'), []);
});

test('a sala esvaziar encerra a ligação; o nome da sala liga e desliga do id da conversa', () => {
  const registry = new DmCallRegistry(45_000, clock().now);
  registry.start('dm1', 'ana', 'bia');
  registry.accept('dm1', 'bia');
  assert.equal(registry.finish('dm1')?.callerId, 'ana');
  assert.equal(registry.finish('dm1'), undefined);
  assert.equal(dmRoomName('abc-123'), 'dm-abc-123');
  assert.equal(dmChannelIdFromRoom('dm-abc-123'), 'abc-123');
  assert.equal(dmChannelIdFromRoom('geral'), null);
});
