import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConnectionQuality, ConnectionState } from 'livekit-client';
import { describeConnectionSignal } from './connectionSignal.js';

describe('describeConnectionSignal', () => {
  it('não mostra nada fora de uma chamada', () => {
    assert.equal(describeConnectionSignal(ConnectionState.Disconnected, ConnectionQuality.Excellent), null);
  });

  it('excelente e boa ficam verdes, com as três barras', () => {
    for (const quality of [ConnectionQuality.Excellent, ConnectionQuality.Good]) {
      const info = describeConnectionSignal(ConnectionState.Connected, quality);
      assert.equal(info?.level, 'good');
      assert.equal(info?.bars, 3);
    }
  });

  it('instável fica amarela com duas barras', () => {
    const info = describeConnectionSignal(ConnectionState.Connected, ConnectionQuality.Poor);
    assert.equal(info?.level, 'fair');
    assert.equal(info?.bars, 2);
  });

  it('perda de conexão fica vermelha com uma barra', () => {
    const info = describeConnectionSignal(ConnectionState.Connected, ConnectionQuality.Lost);
    assert.equal(info?.level, 'bad');
    assert.equal(info?.bars, 1);
  });

  it('reconectando é vermelho, qualquer que seja a última qualidade medida', () => {
    assert.equal(describeConnectionSignal(ConnectionState.Reconnecting, ConnectionQuality.Excellent)?.level, 'bad');
    assert.equal(describeConnectionSignal(ConnectionState.SignalReconnecting, ConnectionQuality.Good)?.level, 'bad');
  });

  it('enquanto conecta ou ainda não mediu, fica neutro', () => {
    assert.equal(describeConnectionSignal(ConnectionState.Connecting, ConnectionQuality.Unknown)?.level, 'pending');
    assert.equal(describeConnectionSignal(ConnectionState.Connected, ConnectionQuality.Unknown)?.level, 'pending');
  });
});
