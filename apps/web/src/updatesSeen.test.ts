import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasUnreadUpdates, parseUpdatesSeen } from './updatesSeen.js';

describe('hasUnreadUpdates', () => {
  it('mostra "NOVO" quando a última novidade é mais nova do que o que a pessoa já viu (ou nunca viu nada)', () => {
    assert.equal(hasUnreadUpdates(2_000, 1_000), true);
    assert.equal(hasUnreadUpdates(2_000, undefined), true);
  });

  it('não mostra quando já viu tudo ou quando o canal não tem novidade', () => {
    assert.equal(hasUnreadUpdates(2_000, 2_000), false);
    assert.equal(hasUnreadUpdates(2_000, 3_000), false);
    assert.equal(hasUnreadUpdates(undefined, 1_000), false);
    assert.equal(hasUnreadUpdates(undefined, undefined), false);
  });
});

describe('parseUpdatesSeen', () => {
  it('lê o que foi guardado', () => {
    assert.deepEqual(parseUpdatesSeen('{"atualizacoes":123,"outro":456}'), { atualizacoes: 123, outro: 456 });
  });

  it('ignora lixo: vazio, JSON quebrado, formato errado e valores que não são número', () => {
    assert.deepEqual(parseUpdatesSeen(null), {});
    assert.deepEqual(parseUpdatesSeen('{quebrado'), {});
    assert.deepEqual(parseUpdatesSeen('[1,2,3]'), {});
    assert.deepEqual(parseUpdatesSeen('"texto"'), {});
    assert.deepEqual(parseUpdatesSeen('{"a":"x","b":null,"c":5}'), { c: 5 });
  });
});
