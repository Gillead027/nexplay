import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  DIAGNOSTIC_AUDIO_DURATION_MS,
  PCM_FRAME_BYTES,
  PcmFrameBuffer,
  ensureDiagnosticAudioFile,
} from './ffmpegAudioSource.js';
import {
  TEST_AUDIO_CHANNELS,
  TEST_AUDIO_SAMPLE_RATE,
  TEST_AUDIO_SAMPLES_PER_CHANNEL,
} from './programmaticAudioSource.js';

describe('PcmFrameBuffer', () => {
  it('reagrupa chunks arbitrários em frames exatos de 3840 bytes', () => {
    const source = Buffer.alloc(8_040);
    for (let offset = 0; offset + 1 < source.length; offset += 2) {
      source.writeInt16LE((offset / 2) % 30_000, offset);
    }

    const buffer = new PcmFrameBuffer();
    const frames = [
      ...buffer.push(source.subarray(0, 500)),
      ...buffer.push(source.subarray(500, 1_200)),
      ...buffer.push(source.subarray(1_200)),
    ];
    assert.equal(PCM_FRAME_BYTES, 3_840);
    assert.equal(frames.length, 2);
    assert.ok(frames.every((frame) => frame.length === TEST_AUDIO_SAMPLES_PER_CHANNEL * TEST_AUDIO_CHANNELS));
    assert.equal(buffer.remainderBytes, 360);
    assert.equal(frames[0]?.[0], 0);
    assert.equal(frames[1]?.[0], TEST_AUDIO_SAMPLES_PER_CHANNEL * TEST_AUDIO_CHANNELS);
  });
});

describe('diagnostic WAV fixture', () => {
  it('gera um WAV PCM local determinístico para o teste FFmpeg', () => {
    const path = ensureDiagnosticAudioFile();
    const bytes = readFileSync(path);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WAVE');
    assert.equal(bytes.readUInt32LE(24), TEST_AUDIO_SAMPLE_RATE);
    assert.equal(bytes.readUInt16LE(34), 16);
    assert.ok(statSync(path).size > 44);
    assert.equal(
      bytes.length,
      44 + TEST_AUDIO_SAMPLE_RATE * (DIAGNOSTIC_AUDIO_DURATION_MS / 1_000) * TEST_AUDIO_CHANNELS * 2,
    );
  });
});
