import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diagnose, diagnosisReport, type StreamStat } from './callDiagnostics';

const base: StreamStat = {
  key: 'recv:a', label: 'Bia', kind: 'audio', direction: 'recv', packets: 0, lost: 0, jitterMs: 5, rttMs: null, concealedSamples: 0,
  framesDecoded: null, framesDropped: null, framesSent: null, fps: null, width: null, height: null, limitReason: null, bytes: 0,
};
const stat = (patch: Partial<StreamStat>): StreamStat => ({ ...base, ...patch });

test('sem problema nenhum, diz que está tudo certo', () => {
  const before = [stat({ packets: 1000, bytes: 50_000 })];
  const after = [stat({ packets: 1100, bytes: 55_000 })];
  const result = diagnose(after, before, 2);
  assert.deepEqual(result.hints, ['Nenhum problema detectado nos últimos segundos.']);
  assert.equal(result.rows[0]!.lossPct, 0);
  assert.equal(result.rows[0]!.bitrateKbps, 20);
});

test('a perda de pacotes é a do intervalo entre as duas leituras, não a acumulada desde o começo', () => {
  const before = [stat({ packets: 10_000, lost: 900 })]; // muita perda no passado
  const after = [stat({ packets: 10_100, lost: 900 })]; // mas nada de novo
  assert.equal(diagnose(after, before, 2).rows[0]!.lossPct, 0);
  const worse = [stat({ packets: 10_100, lost: 910 })];
  assert.equal(diagnose(worse, before, 2).rows[0]!.lossPct, 9.1);
});

test('voz de outra pessoa com falhas preenchidas ou perda alta vira um aviso com o nome dela', () => {
  const before = [stat({ packets: 1000, concealedSamples: 0 })];
  // 2 s de intervalo = 96000 amostras; 9600 preenchidas = 10%
  const after = [stat({ packets: 1080, lost: 20, concealedSamples: 9600 })];
  const { rows, hints } = diagnose(after, before, 2);
  assert.equal(rows[0]!.concealedPct, 10);
  assert.ok(hints.some((hint) => hint.includes('Bia') && hint.includes('picotada')));
  assert.ok(hints.some((hint) => hint.includes('20') || hint.includes('menos pacotes')));
});

test('câmera limitada por processador ou por banda explica o motivo e o que fazer', () => {
  const send = (limitReason: string) => stat({ key: 'send:c', label: 'sua câmera', kind: 'video', direction: 'send', packets: 500, limitReason, fps: 14, width: 640, height: 360 });
  const cpu = diagnose([send('cpu')], [send('cpu')], 2);
  assert.ok(cpu.hints.some((hint) => hint.includes('sobrecarregado') && hint.includes('sua câmera')));
  const banda = diagnose([send('bandwidth')], [send('bandwidth')], 2);
  assert.ok(banda.hints.some((hint) => hint.includes('internet de envio')));
  assert.equal(diagnose([send('none')], [send('none')], 2).rows[0]!.limitReason, null);
  assert.equal(cpu.rows[0]!.resolution, '640×360');
});

test('quadros descartados na decodificação viram aviso de computador pesado', () => {
  const video = (decoded: number, dropped: number) => stat({ key: 'recv:v', label: 'câmera de Caio', kind: 'video', direction: 'recv', packets: decoded, framesDecoded: decoded, framesDropped: dropped, concealedSamples: null });
  const result = diagnose([video(200, 40)], [video(100, 0)], 2); // 100 decodificados e 40 descartados no intervalo
  assert.ok(result.rows[0]!.droppedPct! > 25);
  assert.ok(result.hints.some((hint) => hint.includes('descartando')));
});

test('atraso alto até o servidor aparece uma vez, e o relatório copiável junta linhas e avisos', () => {
  const send = stat({ key: 'send:a', label: 'sua voz', direction: 'send', packets: 100, rttMs: 320, concealedSamples: null });
  const diagnosis = diagnose([send], [send], 2);
  assert.equal(diagnosis.hints.filter((hint) => hint.includes('atraso')).length, 1);
  const report = diagnosisReport(diagnosis, new Date('2026-09-23T12:00:00Z'));
  assert.match(report, /↑ sua voz: .*atraso 320 ms/);
  assert.match(report, /• O atraso até o servidor/);
});
