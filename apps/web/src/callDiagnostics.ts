import { LocalAudioTrack, LocalVideoTrack, RemoteAudioTrack, RemoteVideoTrack, Track, type Room } from 'livekit-client';

// Diagnóstico da chamada: transforma as estatísticas do WebRTC (perda de pacotes, oscilação, atraso, quadros descartados,
// limitação por processador ou por banda...) em frases que dizem ONDE está o problema quando a voz ou a câmera trava. Só
// mede o lado de quem está olhando: para ver o lado do outro, ele mesmo abre este diagnóstico.

export interface StreamStat {
  key: string;
  label: string;
  kind: 'audio' | 'video';
  direction: 'send' | 'recv';
  // Valores acumulados desde o início do fluxo (o diagnóstico usa a diferença entre duas leituras).
  packets: number;
  lost: number;
  jitterMs: number | null;
  rttMs: number | null;
  concealedSamples: number | null;
  framesDecoded: number | null;
  framesDropped: number | null;
  framesSent: number | null;
  fps: number | null;
  width: number | null;
  height: number | null;
  limitReason: string | null;
  bytes: number;
}

export interface DiagnosticRow {
  key: string;
  label: string;
  direction: 'send' | 'recv';
  kind: 'audio' | 'video';
  lossPct: number | null;
  jitterMs: number | null;
  rttMs: number | null;
  concealedPct: number | null;
  droppedPct: number | null;
  fps: number | null;
  resolution: string | null;
  limitReason: string | null;
  bitrateKbps: number | null;
}

export interface Diagnosis {
  rows: DiagnosticRow[];
  hints: string[];
}

const SAMPLE_RATE = 48000;

const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.max(0, (part / whole) * 100) : null);
const round1 = (value: number | null): number | null => (value === null ? null : Math.round(value * 10) / 10);

/** Duas leituras seguidas viram uma linha por fluxo, com o que aconteceu ENTRE elas. */
export function diagnose(current: readonly StreamStat[], previous: readonly StreamStat[] | null, elapsedSeconds: number): Diagnosis {
  const before = new Map((previous ?? []).map((stat) => [stat.key, stat]));
  const rows: DiagnosticRow[] = current.map((stat) => {
    const old = before.get(stat.key);
    const dPackets = old ? Math.max(0, stat.packets - old.packets) : 0;
    const dLost = old ? Math.max(0, stat.lost - old.lost) : 0;
    const dConcealed = old && stat.concealedSamples !== null && old.concealedSamples !== null ? Math.max(0, stat.concealedSamples - old.concealedSamples) : null;
    const dDecoded = old && stat.framesDecoded !== null && old.framesDecoded !== null ? Math.max(0, stat.framesDecoded - old.framesDecoded) : null;
    const dDropped = old && stat.framesDropped !== null && old.framesDropped !== null ? Math.max(0, stat.framesDropped - old.framesDropped) : null;
    const dBytes = old ? Math.max(0, stat.bytes - old.bytes) : 0;
    return {
      key: stat.key,
      label: stat.label,
      direction: stat.direction,
      kind: stat.kind,
      lossPct: round1(pct(dLost, dLost + dPackets)),
      jitterMs: round1(stat.jitterMs),
      rttMs: stat.rttMs === null ? null : Math.round(stat.rttMs),
      concealedPct: dConcealed === null || elapsedSeconds <= 0 ? null : round1(pct(dConcealed, elapsedSeconds * SAMPLE_RATE)),
      droppedPct: dDropped === null || dDecoded === null ? null : round1(pct(dDropped, dDropped + dDecoded)),
      fps: stat.fps === null ? null : Math.round(stat.fps),
      resolution: stat.width && stat.height ? `${stat.width}×${stat.height}` : null,
      limitReason: stat.limitReason && stat.limitReason !== 'none' ? stat.limitReason : null,
      bitrateKbps: elapsedSeconds > 0 && old ? Math.round((dBytes * 8) / 1000 / elapsedSeconds) : null,
    };
  });
  return { rows, hints: buildHints(rows) };
}

function buildHints(rows: readonly DiagnosticRow[]): string[] {
  const hints: string[] = [];
  const kindName = (row: DiagnosticRow) => (row.kind === 'audio' ? 'a voz' : 'a imagem');

  const rtt = Math.max(0, ...rows.map((row) => row.rttMs ?? 0));
  if (rtt > 250) hints.push(`O atraso até o servidor está alto (${rtt} ms). Wi-Fi fraco, VPN ou outro programa usando muita internet costumam causar isso.`);

  for (const row of rows.filter((entry) => entry.direction === 'send')) {
    if ((row.lossPct ?? 0) > 3) hints.push(`Sua internet está perdendo ${row.lossPct}% dos pacotes ao ENVIAR ${kindName(row)} (${row.label}): para os outros ${kindName(row)} pode falhar. Tente cabo de rede ou chegue mais perto do roteador.`);
    if (row.kind === 'audio' && (row.jitterMs ?? 0) > 40) hints.push(`A conexão de envio está oscilando (${row.jitterMs} ms): a sua voz pode chegar picotada para os outros.`);
    if (row.limitReason === 'cpu') hints.push(`Seu computador está sobrecarregado ao codificar ${row.label}: a imagem perde qualidade para não travar. Feche programas pesados, use o modo "Moderado" ou "Completo" em Aparência ou baixe a qualidade.`);
    if (row.limitReason === 'bandwidth') hints.push(`Sua internet de envio não aguenta a qualidade de ${row.label}: a imagem baixa de qualidade sozinha para não congelar. Escolha uma qualidade menor.`);
  }

  for (const row of rows.filter((entry) => entry.direction === 'recv')) {
    if ((row.lossPct ?? 0) > 3) hints.push(`Estão chegando ${row.lossPct}% menos pacotes de ${row.label}: ${kindName(row)} dessa pessoa pode falhar. Se acontece só com ela, a conexão dela é a provável causa; se acontece com todo mundo, é a sua.`);
    if (row.kind === 'audio' && (row.concealedPct ?? 0) > 3) hints.push(`A voz de ${row.label} está com ${row.concealedPct}% de falhas preenchidas pelo navegador (soa picotada ou "engasgada").`);
    if (row.kind === 'video' && (row.droppedPct ?? 0) > 5) hints.push(`Seu computador está descartando ${row.droppedPct}% dos quadros de ${row.label}: a decodificação está pesada para ele. Feche programas pesados ou use o modo "Moderado" ou "Completo" em Aparência.`);
  }

  return hints.length ? hints : ['Nenhum problema detectado nos últimos segundos.'];
}

/** Lê as estatísticas de tudo que este computador envia e recebe na chamada agora. */
export async function readStreamStats(room: Room): Promise<StreamStat[]> {
  const stats: StreamStat[] = [];

  for (const publication of room.localParticipant.trackPublications.values()) {
    const track = publication.track;
    if (track instanceof LocalAudioTrack) {
      const sender = await track.getSenderStats().catch(() => undefined);
      if (!sender) continue;
      stats.push({
        key: `send:${publication.trackSid}`, label: 'sua voz', kind: 'audio', direction: 'send',
        packets: sender.packetsSent ?? 0, lost: sender.packetsLost ?? 0,
        jitterMs: sender.jitter !== undefined ? sender.jitter * 1000 : null, rttMs: sender.roundTripTime !== undefined ? sender.roundTripTime * 1000 : null,
        concealedSamples: null, framesDecoded: null, framesDropped: null, framesSent: null, fps: null, width: null, height: null, limitReason: null, bytes: sender.bytesSent ?? 0,
      });
    } else if (track instanceof LocalVideoTrack) {
      const layers = await track.getSenderStats().catch(() => [] as never[]);
      // A camada de maior resolução é a que os outros veem por padrão; as menores só entram sob pressão.
      const top = [...layers].sort((a, b) => b.frameWidth - a.frameWidth)[0];
      if (!top) continue;
      const screen = publication.source === Track.Source.ScreenShare;
      stats.push({
        key: `send:${publication.trackSid}`, label: screen ? 'sua transmissão de tela' : 'sua câmera', kind: 'video', direction: 'send',
        packets: top.packetsSent ?? 0, lost: top.packetsLost ?? 0,
        jitterMs: top.jitter !== undefined ? top.jitter * 1000 : null, rttMs: top.roundTripTime !== undefined ? top.roundTripTime * 1000 : null,
        concealedSamples: null, framesDecoded: null, framesDropped: null, framesSent: top.framesSent, fps: top.framesPerSecond, width: top.frameWidth, height: top.frameHeight,
        limitReason: top.qualityLimitationReason ?? null, bytes: top.bytesSent ?? 0,
      });
    }
  }

  for (const participant of room.remoteParticipants.values()) {
    const name = participant.name || participant.identity;
    for (const publication of participant.trackPublications.values()) {
      const track = publication.track;
      if (track instanceof RemoteAudioTrack) {
        const receiver = await track.getReceiverStats().catch(() => undefined);
        if (!receiver) continue;
        const screenAudio = publication.source === Track.Source.ScreenShareAudio;
        stats.push({
          key: `recv:${publication.trackSid}`, label: screenAudio ? `áudio da tela de ${name}` : name, kind: 'audio', direction: 'recv',
          packets: receiver.packetsReceived ?? 0, lost: receiver.packetsLost ?? 0,
          jitterMs: receiver.jitter !== undefined ? receiver.jitter * 1000 : null, rttMs: null,
          concealedSamples: receiver.concealedSamples ?? null, framesDecoded: null, framesDropped: null, framesSent: null, fps: null, width: null, height: null, limitReason: null, bytes: receiver.bytesReceived ?? 0,
        });
      } else if (track instanceof RemoteVideoTrack) {
        const receiver = await track.getReceiverStats().catch(() => undefined);
        if (!receiver) continue;
        const screen = publication.source === Track.Source.ScreenShare;
        stats.push({
          key: `recv:${publication.trackSid}`, label: screen ? `tela de ${name}` : `câmera de ${name}`, kind: 'video', direction: 'recv',
          packets: receiver.packetsReceived ?? 0, lost: receiver.packetsLost ?? 0,
          jitterMs: receiver.jitter !== undefined ? receiver.jitter * 1000 : null, rttMs: null,
          concealedSamples: null, framesDecoded: receiver.framesDecoded, framesDropped: receiver.framesDropped, framesSent: null, fps: null,
          width: receiver.frameWidth ?? null, height: receiver.frameHeight ?? null, limitReason: null, bytes: receiver.bytesReceived ?? 0,
        });
      }
    }
  }
  return stats;
}

/** O texto que a pessoa pode copiar e mandar para o admin. */
export function diagnosisReport(diagnosis: Diagnosis, when: Date): string {
  const lines = [`Diagnóstico da chamada NexPlay — ${when.toLocaleString('pt-BR')}`, ''];
  for (const row of diagnosis.rows) {
    const parts = [
      row.lossPct !== null ? `perda ${row.lossPct}%` : null,
      row.jitterMs !== null ? `oscilação ${row.jitterMs} ms` : null,
      row.rttMs !== null ? `atraso ${row.rttMs} ms` : null,
      row.concealedPct !== null ? `falhas preenchidas ${row.concealedPct}%` : null,
      row.droppedPct !== null ? `quadros descartados ${row.droppedPct}%` : null,
      row.fps !== null ? `${row.fps} quadros/s` : null,
      row.resolution,
      row.limitReason ? `limitado por ${row.limitReason}` : null,
      row.bitrateKbps !== null ? `${row.bitrateKbps} kbps` : null,
    ].filter(Boolean);
    lines.push(`${row.direction === 'send' ? '↑' : '↓'} ${row.label}: ${parts.join(', ')}`);
  }
  lines.push('', ...diagnosis.hints.map((hint) => `• ${hint}`));
  return lines.join('\n');
}
