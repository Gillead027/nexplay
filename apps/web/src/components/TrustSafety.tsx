import { useCallback, useEffect, useState } from 'react';
import type { Channel, ModerationIncidentSummary, PendingIdentityVerification, Server, TextMessage } from '@nexplay/shared';
import { api } from '../api';
import { MarkdownText } from './Markdown';
import { MessageAttachments } from './TextChannels';

const REFRESH_MS = 30_000;

const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

const CATEGORY_LABEL: Record<ModerationIncidentSummary['category'], string> = {
  self_harm: 'Autolesão/suicídio',
  nudity: 'Nudez',
  csam: 'Abuso infantil',
};

// Painel de confiança e segurança (só ADMIN_USERNAMES): verificações de identidade manuais
// aguardando revisão, a fila de incidentes (hoje: autolesão em texto), e a visão só-leitura de
// qualquer servidor da instância. Atualiza sozinho.
export function TrustSafetyPane() {
  const [tab, setTab] = useState<'queue' | 'servers'>('queue');

  return (
    <div className="settings-pane admin-pane">
      <h2>Confiança e segurança</h2>
      <div className="trust-safety-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'queue'} className={tab === 'queue' ? 'active' : ''} onClick={() => setTab('queue')}>
          Fila de revisão
        </button>
        <button type="button" role="tab" aria-selected={tab === 'servers'} className={tab === 'servers' ? 'active' : ''} onClick={() => setTab('servers')}>
          Servidores da instância
        </button>
      </div>
      {tab === 'queue' ? <ReviewQueue /> : <ServerBrowser />}
    </div>
  );
}

function ReviewQueue() {
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
    <>
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
    </>
  );
}

// Visão só-leitura de qualquer servidor da instância, mesmo sem ser membro — nunca posta,
// reage nem gerencia nada por aqui (ver /api/admin/servers* em index.ts). Navegação simples em
// 3 níveis: servidores -> canais -> mensagens de um canal de texto.
function ServerBrowser() {
  const [servers, setServers] = useState<Server[] | null>(null);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<TextMessage[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getAllServersForAdmin()
      .then(({ servers }) => setServers(servers))
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar os servidores.'));
  }, []);

  function openServer(server: Server) {
    setSelectedServer(server);
    setChannels(null);
    setSelectedChannel(null);
    setMessages(null);
    setError('');
    api.getServerChannelsForAdmin(server.id)
      .then(({ channels }) => setChannels(channels))
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar os canais.'));
  }

  function openChannel(channel: Channel) {
    if (!selectedServer || channel.type !== 'TEXT') return;
    setSelectedChannel(channel);
    setMessages(null);
    setError('');
    api.getChannelMessagesForAdmin(selectedServer.id, channel.id)
      .then(({ messages }) => setMessages(messages))
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar as mensagens.'));
  }

  return (
    <>
      <p className="settings-page-description">
        Visualização só-leitura, pra prevenir e responder a abuso — não dá pra postar, reagir nem gerenciar nada por aqui.
      </p>
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="trust-safety-breadcrumb">
        <button type="button" className="trust-safety-crumb" onClick={() => { setSelectedServer(null); setSelectedChannel(null); }}>
          Servidores
        </button>
        {selectedServer && (
          <>
            <span>/</span>
            <button type="button" className="trust-safety-crumb" onClick={() => setSelectedChannel(null)}>{selectedServer.name}</button>
          </>
        )}
        {selectedChannel && (
          <>
            <span>/</span>
            <span>{selectedChannel.name}</span>
          </>
        )}
      </div>

      {!selectedServer && (
        <ul className="trust-safety-list">
          {servers?.map((server) => (
            <li key={server.id} className="trust-safety-item trust-safety-item-clickable" onClick={() => openServer(server)}>
              <strong>{server.name}</strong>
              <span className="settings-hint">criado em {date.format(server.createdAt)}</span>
            </li>
          ))}
          {servers?.length === 0 && <p className="settings-hint">Nenhum servidor criado ainda.</p>}
        </ul>
      )}

      {selectedServer && !selectedChannel && (
        <ul className="trust-safety-list">
          {channels?.filter((channel) => channel.type === 'TEXT').map((channel) => (
            <li key={channel.id} className="trust-safety-item trust-safety-item-clickable" onClick={() => openChannel(channel)}>
              <strong># {channel.name}</strong>
            </li>
          ))}
          {channels && channels.filter((channel) => channel.type === 'TEXT').length === 0 && (
            <p className="settings-hint">Este servidor não tem canal de texto.</p>
          )}
        </ul>
      )}

      {selectedChannel && (
        <div className="trust-safety-messages">
          {messages?.length === 0 && <p className="settings-hint">Nenhuma mensagem neste canal.</p>}
          {messages?.map((message) => (
            <div key={message.id} className="trust-safety-message">
              <div className="trust-safety-message-header">
                <strong>{message.senderName}</strong>
                <span className="settings-hint">{time.format(message.sentAt)}</span>
              </div>
              {message.text && <MarkdownText text={message.text} />}
              {message.attachments?.length ? <MessageAttachments attachments={message.attachments} /> : null}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
