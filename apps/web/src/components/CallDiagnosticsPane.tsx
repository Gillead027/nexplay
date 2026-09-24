import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room } from 'livekit-client';
import { diagnose, diagnosisReport, readStreamStats, type Diagnosis, type StreamStat } from '../callDiagnostics';

const REFRESH_MS = 2000;

const dash = (value: number | string | null, suffix = ''): string => (value === null ? '—' : `${value}${suffix}`);

// Configurações > Voz e vídeo: o que a chamada está passando AGORA (perda de pacotes, oscilação, atraso, quadros descartados, se o
// computador ou a internet estão limitando a imagem), em frases. Serve para descobrir de quem é o problema quando a voz ou a câmera
// trava, e o relatório pode ser copiado e mandado ao admin.
export function CallDiagnosticsPane({ room, connected }: { room: Room; connected: boolean }) {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [copied, setCopied] = useState(false);
  const previous = useRef<{ stats: StreamStat[]; at: number } | null>(null);

  const refresh = useCallback(async () => {
    const stats = await readStreamStats(room);
    const now = Date.now();
    const before = previous.current;
    setDiagnosis(diagnose(stats, before?.stats ?? null, before ? (now - before.at) / 1000 : 0));
    previous.current = { stats, at: now };
  }, [room]);

  useEffect(() => {
    if (!connected) {
      previous.current = null;
      setDiagnosis(null);
      return undefined;
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [connected, refresh]);

  async function copyReport() {
    if (!diagnosis) return;
    try {
      await navigator.clipboard.writeText(diagnosisReport(diagnosis, new Date()));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="call-diagnostics">
      <span className="settings-label">Diagnóstico da chamada</span>
      <p className="settings-hint">
        Quando a voz ou a câmera travar, abra aqui durante a chamada: mostra se o problema está na sua internet, no seu computador ou na
        conexão de quem está falando.
      </p>
      {!connected && <p className="settings-hint">Entre numa chamada de voz para ver o diagnóstico ao vivo.</p>}
      {connected && !diagnosis && <p className="settings-hint">Medindo…</p>}
      {connected && diagnosis && (
        <>
          <ul className="call-diagnostics-hints">
            {diagnosis.hints.map((hint) => <li key={hint}>{hint}</li>)}
          </ul>
          <div className="admin-table-wrap">
            <table className="admin-table call-diagnostics-table">
              <thead>
                <tr><th /><th>Perda</th><th>Oscilação</th><th>Atraso</th><th>Falhas</th><th>Quadros/s</th><th>Imagem</th></tr>
              </thead>
              <tbody>
                {diagnosis.rows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.direction === 'send' ? '↑' : '↓'} {row.label}</td>
                    <td>{dash(row.lossPct, '%')}</td>
                    <td>{dash(row.jitterMs, ' ms')}</td>
                    <td>{dash(row.rttMs, ' ms')}</td>
                    <td>{dash(row.concealedPct ?? row.droppedPct, '%')}</td>
                    <td>{dash(row.fps)}</td>
                    <td>{row.limitReason ? `${dash(row.resolution)} (limitada: ${row.limitReason === 'cpu' ? 'computador' : row.limitReason === 'bandwidth' ? 'internet' : row.limitReason})` : dash(row.resolution)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="secondary-pill" onClick={() => void copyReport()}>
            {copied ? 'Relatório copiado!' : 'Copiar relatório'}
          </button>
        </>
      )}
    </div>
  );
}
