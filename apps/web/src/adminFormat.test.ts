import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBytes, formatUptime, percent } from './adminFormat';

test('formatBytes escolhe a unidade e usa vírgula decimal', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1500), '1,5 KB');
  assert.equal(formatBytes(1_462_272), '1,4 MB');
  assert.equal(formatBytes(5 * 1024 ** 3), '5,0 GB');
  assert.equal(formatBytes(250 * 1024 ** 2), '250 MB');
  assert.equal(formatBytes(-1), '—');
  assert.equal(formatBytes(Number.NaN), '—');
});

test('formatUptime mostra só as duas maiores unidades', () => {
  assert.equal(formatUptime(90), '1 min');
  assert.equal(formatUptime(3_700), '1 h 1 min');
  assert.equal(formatUptime(3 * 86_400 + 5 * 3_600 + 40), '3 d 5 h');
  assert.equal(formatUptime(-5), '—');
});

test('percent fica entre 0 e 100 e não divide por zero', () => {
  assert.equal(percent(1, 4), 25);
  assert.equal(percent(5, 4), 100);
  assert.equal(percent(1, 0), 0);
  assert.equal(percent(-3, 10), 0);
});
