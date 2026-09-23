import { useCallback, useEffect, useState } from 'react';
import type { ModerationIncidentSummary, PendingIdentityVerification } from '@nexplay/shared';
import { api } from '../api';

const REFRESH_MS = 30_000;

const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const CATEGORY_LABEL: Record<ModerationIncidentSummary['category'], string> = {
  self_harm: 'Autolesão/suicídio',
  nudity: 'Nudez',
  csam: 'Abuso infantil',
};

// Painel de confiança e segurança (só ADMIN_USERNAMES): verificações de identidade manuais
// aguardando revisão e a fila de incidentes (hoje: autolesão em texto). Atualiza sozinho.
export function TrustSafetyPane() {
  const [pending, setPending] = useState<PendingIdentityVerification[] | null>(null);
  const [incidents, setIncidents] = useState<ModerationIncidentSummary[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    try {
      const [pendingResult, incidentsResult] = await Promise.all([
        api.getPendingIdentityVerifications(),
        api.getModerationIncidents('open'),
      ]);
      setPending(pendingResult.pending);
      setIncidents(incidentsResult.incidents);
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar a fila.');
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  async function decide(attemptId: string, decision: 'verified' | 'rejected') {
    setBusyId(attemptId);
    try {
      await api.decideIdentityVerification(attemptId, decision);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível registrar a decisão.');
    } finally {
      setBusyId('');
    }
  }

  async function resolveIncident(incidentId: string, decision: 'confirmed' | 'dismissed') {
    setBusyId(incidentId);
    try {
      await api.resolveModerationIncident(incidentId, decision);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível resolver o incidente.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="settings-pane admin-pane">
      <h2>Confiança e segurança</h2>
      <p className="settings-page-description">Verificações de identidade e incidentes aguardando revisão. Só quem está em ADMIN_USERNAMES vê esta tela.</p>
      {error && <p className="form-error" role="alert">{error}</p>}

      <h3 className="admin-heading">Verificações de identidade pendentes</h3>
      {pending?.length === 0 && <p className="settings-hint">Nada pendente.</p>}
      {pending && pending.length > 0 && (
        <ul className="trust-safety-list">
          {pending.map((attempt) => (
            <li key={attempt.id} className="trust-safety-item">
              <div className="trust-safety-item-header">
                <strong>{attempt.displayName}</strong>
                <span>{date.format(attempt.createdAt)}</span>
              </div>
              <div className="trust-safety-images">
                <img src={api.identityVerificationImageUrl(attempt.id, 'document')} alt="Documento enviado" />
                <img src={api.identityVerificationImageUrl(attempt.id, 'selfie')} alt="Selfie enviada" />
              </div>
              <div className="trust-safety-actions">
                <button type="button" className="primary-button" disabled={busyId === attempt.id} onClick={() => void decide(attempt.id, 'verified')}>
                  Aprovar
                </button>
                <button type="button" className="test-toggle-button" disabled={busyId === attempt.id} onClick={() => void decide(attempt.id, 'rejected')}>
                  Recusar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="admin-heading">Fila de incidentes</h3>
      {incidents?.length === 0 && <p className="settings-hint">Nenhum incidente em aberto.</p>}
      {incidents && incidents.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Categoria</th><th>Prioridade</th><th>Quando</th><th>Ação</th></tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident.id} className={incident.priority === 'high' ? 'test' : ''}>
                  <td>{CATEGORY_LABEL[incident.category]}</td>
                  <td>{incident.priority === 'high' ? 'Alta' : 'Normal'}</td>
                  <td>{date.format(incident.createdAt)}</td>
                  <td className="trust-safety-actions">
                    <button type="button" className="primary-button" disabled={busyId === incident.id} onClick={() => void resolveIncident(incident.id, 'confirmed')}>
                      Confirmar
                    </button>
                    <button type="button" className="test-toggle-button" disabled={busyId === incident.id} onClick={() => void resolveIncident(incident.id, 'dismissed')}>
                      Descartar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {incidents && incidents.some((incident) => incident.priority === 'high') && (
        <p className="settings-hint">
          Se algum incidente envolver menor de idade: denuncie na{' '}
          <a href="https://new.safernet.org.br/denuncie" target="_blank" rel="noreferrer">SaferNet Brasil</a> ou pelo Disque 100.
        </p>
      )}
    </div>
  );
}
