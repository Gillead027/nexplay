import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Regressão de um erro real: o LiveKit cria o microfone SEM contexto de áudio e, se o processador vier nas opções de captura,
// tenta anexá-lo na hora e falha com "Audio context needs to be set on LocalAudioTrack in order to enable processors" (a pessoa
// não conseguia nem desmutar). O processador só pode ser anexado depois da publicação.
const source = readFileSync(new URL('./useVoiceRoom.ts', import.meta.url), 'utf8');

test('o processador de áudio nunca vai nas opções de captura do microfone', () => {
  const defaults = /audioCaptureDefaults:\s*\{[^}]*\}/.exec(source)?.[0] ?? '';
  assert.ok(defaults, 'audioCaptureDefaults existe');
  assert.ok(!/processor/.test(defaults), `audioCaptureDefaults não pode ter processor: ${defaults}`);
  const options = /const currentMicCaptureOptions = useCallback\(([\s\S]*?)\n  \);/.exec(source)?.[1] ?? '';
  assert.ok(options.length > 0, 'currentMicCaptureOptions existe');
  assert.ok(!/processor/.test(options.replace(/\/\/[^\n]*/g, '')), 'currentMicCaptureOptions não pode passar processor');
});

test('o processador é anexado ao microfone depois de publicado', () => {
  assert.match(source, /RoomEvent\.LocalTrackPublished,\s*onLocalTrackPublished/);
  assert.match(source, /track\.setProcessor\(processor\)/);
  // se não anexar, a pessoa continua com microfone (sem o tratamento) e é avisada, nunca fica sem poder falar
  assert.match(source, /o microfone segue sem ele/);
});
