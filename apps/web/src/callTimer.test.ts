import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RoomSummary } from '@nexplay/shared';
import { formatCallDuration, stampRoom } from './callTimer';

test('o tempo aparece como minutos:segundos e, a partir de 1 hora, horas:minutos:segundos', () => {
  assert.equal(formatCallDuration(0), '0:00');
  assert.equal(formatCallDuration(45_000), '0:45');
  assert.equal(formatCallDuration(12 * 60_000 + 3_000), '12:03');
  assert.equal(formatCallDuration(59 * 60_000 + 59_999), '59:59');
  assert.equal(formatCallDuration(3_600_000), '1:00:00');
  assert.equal(formatCallDuration(3_600_000 + 2 * 60_000 + 15_000), '1:02:15');
  assert.equal(formatCallDuration(26 * 3_600_000 + 5_000), '26:00:05');
  assert.equal(formatCallDuration(-5_000), '0:00');
});

test('o começo local é o instante em que a sala chegou menos o tempo que o servidor contou (sem depender do relógio dele)', () => {
  const base = { id: 'sala', participants: [] } as unknown as RoomSummary;
  assert.equal(stampRoom({ ...base, callElapsedMs: 90_000 }, 1_000_000).callStartedAtLocal, 910_000);
  assert.equal(stampRoom({ ...base, callElapsedMs: 0 }, 1_000_000).callStartedAtLocal, 1_000_000);
  // sem chamada (ninguém na sala) ou servidor antigo que não manda o campo: não há cronômetro
  assert.equal(stampRoom({ ...base, callElapsedMs: null }, 1_000_000).callStartedAtLocal, null);
  assert.equal(stampRoom(base, 1_000_000).callStartedAtLocal, null);
});
