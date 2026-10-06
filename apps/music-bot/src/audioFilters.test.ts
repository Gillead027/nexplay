import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MUSIC_FILTERS } from '@nexplay/shared';
import { ffmpegChainFor, ffmpegPipeArgs } from './audioFilters.js';

describe('filtros de áudio', () => {
  it('sem filtro não cria cadeia; cada filtro com nome tem a sua', () => {
    assert.equal(ffmpegChainFor('off'), null);
    for (const filter of MUSIC_FILTERS.filter((name) => name !== 'off')) {
      const chain = ffmpegChainFor(filter);
      assert.ok(chain && chain.length > 0, `${filter} precisa de uma cadeia`);
    }
  });

  it('os argumentos do FFmpeg só recebem -af quando há filtro, e ele vem antes da conversão', () => {
    const plain = ffmpegPipeArgs(null, 48000, 2);
    assert.equal(plain.includes('-af'), false);
    const filtered = ffmpegPipeArgs('bass=g=10:f=110:w=0.6', 48000, 2);
    const at = filtered.indexOf('-af');
    assert.equal(filtered[at + 1], 'bass=g=10:f=110:w=0.6');
    assert.ok(at < filtered.indexOf('-f'), 'o filtro entra antes do formato de saída');
    assert.equal(filtered.at(-1), 'pipe:1');
  });
});
