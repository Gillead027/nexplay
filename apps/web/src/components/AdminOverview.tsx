import { useCallback, useEffect, useState } from 'react';
import type { AdminOverview } from '@nexplay/shared';
import { api } from '../api';
import { formatBytes, formatUptime, percent } from '../adminFormat';
import { DeleteAccountDialog } from './DeleteAccountDialog';

const REFRESH_MS = 30_000;

const number = new Intl.NumberFormat('pt-BR');
const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="admin-stat">
      <strong>{typeof value === 'number' ? number.format(value) : value}</strong>
      <span>{label}</span>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function Meter({ label, used, total }: { label: string; used: number; total: number }) {
  const pct = percent(used, total);
  return (
    <div className="admin-meter">
      <div className="admin-meter-head">
        <span>{label}</span>
        <span>{formatBytes(used)} de {formatBytes(total)} ({pct}%)</span>
      </div>
      <div className="admin-meter-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className={`admin-meter-fill ${pct >= 90 ? 'high' : pct >= 75 ? 'warn' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Visão geral da instância (só pra quem está em ADMIN_USERNAMES): pessoas, servidores
// criados, atividade e o consumo da máquina. Atualiza sozinha enquanto está aberta.
export function AdminOverviewPane({ ownUserId }: { ownUserId: string }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<{ id: string; username: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { overview } = await api.getAdminOverview();
      setOverview(overview);
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar a visão geral.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <div className="settings-pane admin-pane">
      <div className="settings-pane-heading-row">
        <h2>Administração</h2>
        <button type="button" className="secondary-pill" onClick={() => void load()} disabled={loading}>
          {loading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>
      <p className="settings-page-description">
        Visão geral da instância{overview ? `, atualizada às ${time.format(overview.generatedAt)}` : ''}. Só quem está em ADMIN_USERNAMES vê esta tela.
      </p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!overview && !error && <p>Carregando…</p>}
      {overview && (
        <>
          <h3 className="admin-heading">Pessoas</h3>
          <div className="admin-grid">
            <Stat label="Pessoas reais" value={overview.people.real} hint="contas sem nome de teste" />
            <Stat label="Contas de teste" value={overview.people.testLooking} hint="smoke, e2e, prd, debug, test" />
            <Stat label="Contas no total" value={overview.people.total} />
            <Stat label="Online agora" value={overview.people.online} />
            <Stat label="Novas em 7 dias" value={overview.people.new7d} />
            <Stat label="Novas em 30 dias" value={overview.people.new30d} />
            <Stat label="Mandaram mensagem em 7 dias" value={overview.people.messaged7d} />
            <Stat label="Sem nenhum servidor" value={overview.people.withoutServer} />
          </div>

          <h3 className="admin-heading">Servidores criados: {number.format(overview.servers.total)}</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Servidor</th><th>Dono</th><th>Membros</th><th>Canais (texto / voz)</th><th>Mensagens</th><th>Criado em</th></tr>
              </thead>
              <tbody>
                {overview.servers.list.map((server) => (
                  <tr key={server.id}>
                    <td>{server.name}</td>
                    <td>{server.owner ?? '—'}</td>
                    <td>{number.format(server.members)}</td>
                    <td>{server.textChannels} / {server.voiceChannels}</td>
                    <td>{number.format(server.messages)}</td>
                    <td>{date.format(server.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="admin-heading">Atividade</h3>
          <div className="admin-grid">
            <Stat label="Mensagens em canais" value={overview.activity.channelMessages} hint={`${number.format(overview.activity.channelMessages24h)} em 24 h · ${number.format(overview.activity.channelMessages7d)} em 7 dias`} />
            <Stat label="Mensagens diretas" value={overview.activity.directMessages} hint={`${number.format(overview.activity.directMessages24h)} em 24 h · ${number.format(overview.activity.directMessages7d)} em 7 dias`} />
            <Stat
              label="Em call agora"
              value={overview.voice ? overview.voice.participants : '—'}
              hint={overview.voice ? `${overview.voice.activeRooms} ${overview.voice.activeRooms === 1 ? 'sala ativa' : 'salas ativas'}` : 'LiveKit não respondeu'}
            />
          </div>

          <h3 className="admin-heading">Consumo do servidor</h3>
          <div className="admin-meters">
            <Meter label="Memória da máquina" used={overview.machine.memoryTotalBytes - overview.machine.memoryFreeBytes} total={overview.machine.memoryTotalBytes} />
            <Meter label="Disco dos dados" used={overview.storage.diskTotalBytes - overview.storage.diskFreeBytes} total={overview.storage.diskTotalBytes} />
          </div>
          <div className="admin-grid">
            <Stat
              label="Carga do processador"
              value={overview.machine.load1.toFixed(2).replace('.', ',')}
              hint={`${overview.machine.cpuCores} ${overview.machine.cpuCores === 1 ? 'núcleo' : 'núcleos'} · 5 min ${overview.machine.load5.toFixed(2).replace('.', ',')} · 15 min ${overview.machine.load15.toFixed(2).replace('.', ',')}`}
            />
            <Stat label="Memória da API" value={formatBytes(overview.machine.apiMemoryBytes)} />
            <Stat label="API no ar há" value={formatUptime(overview.machine.apiUptimeSeconds)} />
            <Stat label="Máquina ligada há" value={formatUptime(overview.machine.hostUptimeSeconds)} />
            <Stat label="Banco de dados" value={formatBytes(overview.storage.databaseBytes)} />
            <Stat label="Anexos" value={formatBytes(overview.storage.attachmentBytes)} hint={`${number.format(overview.storage.attachmentCount)} ${overview.storage.attachmentCount === 1 ? 'arquivo' : 'arquivos'}`} />
          </div>

          <h3 className="admin-heading">Contas</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Usuário</th><th>Criada em</th><th>Servidores</th><th>Mensagens</th><th>Situação</th><th /></tr>
              </thead>
              <tbody>
                {overview.people.accounts.map((account) => (
                  <tr key={account.id} className={account.testLooking ? 'test' : ''}>
                    <td>{account.username}</td>
                    <td>{date.format(account.createdAt)}</td>
                    <td>{account.servers}</td>
                    <td>{number.format(account.messages)}</td>
                    <td>{account.online ? 'Online' : 'Offline'}{account.testLooking ? ' · teste' : ''}</td>
                    <td>
                      {account.id !== ownUserId && (
                        <button type="button" className="secondary-pill danger-pill" onClick={() => setAccountToDelete({ id: account.id, username: account.username })}>
                          Excluir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {accountToDelete && (
        <DeleteAccountDialog
          mode="admin"
          targetName={accountToDelete.username}
          loadPreview={() => api.getAdminDeletionPreview(accountToDelete.id)}
          onConfirm={() => api.deleteUserAsAdmin(accountToDelete.id)}
          onClose={() => setAccountToDelete(null)}
          onDeleted={() => { setAccountToDelete(null); void load(); }}
        />
      )}
    </div>
  );
}
