import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { PresenceTracker } from './presence.js';

describe('presença por conexões de tempo real', () => {
  let events: Array<[string, boolean]>;
  let tracker: PresenceTracker;

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout'] });
    events = [];
    tracker = new PresenceTracker((userId, online) => events.push([userId, online]), 5_000);
  });

  afterEach(() => {
    mock.timers.reset();
  });

  it('a primeira conexão deixa a pessoa online e avisa', () => {
    tracker.connect('ana');
    assert.deepEqual(events, [['ana', true]]);
    assert.equal(tracker.isOnline('ana'), true);
  });

  it('uma segunda aba não avisa de novo', () => {
    tracker.connect('ana');
    tracker.connect('ana');
    assert.deepEqual(events, [['ana', true]]);
  });

  it('fechar uma de duas abas não deixa a pessoa offline', () => {
    tracker.connect('ana');
    tracker.connect('ana');
    tracker.disconnect('ana');
    mock.timers.tick(60_000);
    assert.deepEqual(events, [['ana', true]]);
    assert.equal(tracker.isOnline('ana'), true);
  });

  it('a última conexão fechada só avisa offline depois da carência', () => {
    tracker.connect('ana');
    tracker.disconnect('ana');
    mock.timers.tick(4_999);
    assert.deepEqual(events, [['ana', true]]);
    assert.equal(tracker.isOnline('ana'), true, 'durante a carência ainda conta como online');
    mock.timers.tick(1);
    assert.deepEqual(events, [['ana', true], ['ana', false]]);
    assert.equal(tracker.isOnline('ana'), false);
  });

  it('recarregar a página (fecha e reabre dentro da carência) não pisca pra ninguém', () => {
    tracker.connect('ana');
    tracker.disconnect('ana');
    mock.timers.tick(1_500);
    tracker.connect('ana');
    mock.timers.tick(60_000);
    assert.deepEqual(events, [['ana', true]], 'nenhum offline nem novo online foi avisado');
    assert.equal(tracker.isOnline('ana'), true);
  });

  it('depois de ficar offline de verdade, voltar avisa online de novo', () => {
    tracker.connect('ana');
    tracker.disconnect('ana');
    mock.timers.tick(5_000);
    tracker.connect('ana');
    assert.deepEqual(events, [['ana', true], ['ana', false], ['ana', true]]);
  });

  it('cada pessoa é independente', () => {
    tracker.connect('ana');
    tracker.connect('bia');
    tracker.disconnect('ana');
    mock.timers.tick(5_000);
    assert.deepEqual(events, [['ana', true], ['bia', true], ['ana', false]]);
    assert.equal(tracker.isOnline('bia'), true);
    assert.equal(tracker.isOnline('ana'), false);
  });

  it('desconectar quem nunca conectou, ou desconectar demais, é inofensivo', () => {
    tracker.disconnect('ninguem');
    tracker.connect('ana');
    tracker.disconnect('ana');
    tracker.disconnect('ana');
    mock.timers.tick(5_000);
    assert.deepEqual(events, [['ana', true], ['ana', false]]);
  });
});
