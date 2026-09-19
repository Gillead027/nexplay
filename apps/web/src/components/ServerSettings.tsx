import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ACCENT_COLORS,
  AVATAR_DATA_URL_MAX_LENGTH,
  hasPermission,
  PERMISSION_DEFINITIONS,
  Permission,
  ROLE_NAME_MAX_LENGTH,
  SERVER_DESCRIPTION_MAX_LENGTH,
  SERVER_NAME_MAX_LENGTH,
  type AccentColor,
  type BanRecord,
  type Invite,
  type MemberSummary,
  type Role,
  type Server,
  type ServerMember,
} from '@nexplay/shared';
import { api } from '../api';
import { copyText } from '../clipboard';
import { fileToResizedDataUrl } from '../imageResize';
import { onRealtimeEvent } from '../realtime';
import { CloseIcon, CopyIcon, ImageIcon, PlusIcon, SearchIcon, SettingsIcon, TrashIcon, UserIcon } from './Icons';

type ServerSettingsSection = 'profile' | 'roles' | 'members' | 'invites' | 'integrations';

const ROLE_COLOR_SWATCHES = ['#7c6ff2', '#4fc6ad', '#ee7798', '#f2ad5c', '#4f8edc', '#a76de0', '#68708b', '#8a91a6'];

function isFlagSet(bitfield: number, flag: number): boolean {
  return (bitfield & flag) !== 0;
}

function highestPosition(roleIds: string[], roles: Role[]): number {
  let max = 0;
  for (const roleId of roleIds) {
    const role = roles.find((candidate) => candidate.id === roleId);
    if (role && role.position > max) max = role.position;
  }
  return max;
}

function formatTimeoutUntil(timestamp: number): string {
  return new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function ServerSettings({
  open,
  onClose,
  server,
  member,
  onServerUpdated,
  onServerDeleted,
}: {
  open: boolean;
  onClose: () => void;
  server: Server;
  member: ServerMember;
  onServerUpdated: (server: Server) => void;
  onServerDeleted: () => void;
}) {
  const [section, setSection] = useState<ServerSettingsSection>('profile');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const canManageServer = hasPermission(member.permissions, Permission.MANAGE_SERVER);
  // Só dono exclui, igual Discord real — servidor órfão (dono com conta
  // excluída) libera pra quem tiver Gerenciar Servidor, senão ninguém mais
  // conseguiria excluí-lo.
  const canDeleteServer = server.ownerId ? server.ownerId === member.userId : canManageServer;

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <section className="server-settings-shell" aria-label="Configurações do servidor">
      <nav className="server-settings-nav">
        <div className="server-settings-heading">
          <span className="server-settings-avatar">{server.name.charAt(0).toUpperCase()}</span>
          <div><strong>{server.name}</strong><span>Configurações do servidor</span></div>
        </div>
        <span className="settings-nav-group">Servidor</span>
        <button type="button" className={section === 'profile' ? 'active' : ''} onClick={() => setSection('profile')}>
          <SettingsIcon size={17} /> Perfil do servidor
        </button>
        <span className="settings-nav-group">Pessoas</span>
        <button type="button" className={section === 'roles' ? 'active' : ''} onClick={() => setSection('roles')}>
          <UserIcon size={17} /> Cargos
        </button>
        <button type="button" className={section === 'members' ? 'active' : ''} onClick={() => setSection('members')}>
          <span className="nav-glyph">♙</span> Membros
        </button>
        <button type="button" className={section === 'invites' ? 'active' : ''} onClick={() => setSection('invites')}>
          <span className="nav-glyph">⌘</span> Convites
        </button>
        <span className="settings-nav-group">Comunidade</span>
        <button type="button" className={section === 'integrations' ? 'active' : ''} onClick={() => setSection('integrations')}>
          <span className="nav-glyph">◉</span> Integrações
        </button>
        {canDeleteServer && (
          <>
            <div className="server-settings-nav-spacer" />
            <button type="button" className="server-settings-danger" onClick={() => setDeleteOpen(true)}>
              <TrashIcon size={17} /> Excluir servidor
            </button>
          </>
        )}
      </nav>

      <div className="server-settings-content">
        {section === 'profile' && <ServerProfilePane server={server} canManageServer={canManageServer} onServerUpdated={onServerUpdated} />}
        {section === 'roles' && <RolesPane serverId={server.id} member={member} />}
        {section === 'members' && <MembersPane serverId={server.id} member={member} />}
        {section === 'invites' && <InvitesPane serverId={server.id} canManageServer={canManageServer} />}
        {section === 'integrations' && (
          <div className="server-profile-page">
            <div className="server-page-title"><div><h1>Integrações</h1><p>Nenhuma integração disponível.</p></div></div>
          </div>
        )}
      </div>
      <button type="button" className="server-settings-close" onClick={onClose} aria-label="Fechar configurações do servidor">
        <CloseIcon size={20} /><span>ESC</span>
      </button>
      <DeleteServerDialog
        open={deleteOpen}
        server={server}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false);
          onServerDeleted();
        }}
      />
    </section>
  );
}

function DeleteServerDialog({
  open,
  server,
  onClose,
  onDeleted,
}: {
  open: boolean;
  server: Server;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmName, setConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setConfirmName('');
      setError('');
      setDeleting(false);
    }
  }, [open]);

  // O diálogo fica por cima das Configurações do servidor, que também escutam Esc
  // no window. Este ouvinte roda antes (fase de captura) e consome o toque, pra
  // um Esc fechar só o diálogo, não as duas camadas. Durante a exclusão o Esc é
  // engolido sem fechar nada.
  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (!deleting) onClose();
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [open, deleting, onClose]);

  if (!open) return null;

  async function confirmDelete() {
    setDeleting(true);
    setError('');
    try {
      await api.deleteServer(server.id, confirmName);
      onDeleted();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível excluir o servidor.');
      setDeleting(false);
    }
  }

  const matches = confirmName === server.name;

  return (
    <div className="dialog-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) onClose(); }}>
      <div className="channel-dialog delete-server-confirm" role="dialog" aria-modal="true">
        <header>
          <div><h2>Excluir "{server.name}"</h2></div>
          <button type="button" onClick={onClose} disabled={deleting} aria-label="Fechar"><CloseIcon size={18} /></button>
        </header>
        <p>
          Essa ação é <strong>permanente</strong>. Todos os canais, categorias, mensagens, cargos e
          convites deste servidor serão apagados pra sempre — não tem como desfazer.
        </p>
        <label htmlFor="delete-server-confirm-input">
          Digite <strong>{server.name}</strong> pra confirmar
        </label>
        <input
          id="delete-server-confirm-input"
          value={confirmName}
          onChange={(event) => setConfirmName(event.target.value)}
          autoComplete="off"
          autoFocus
        />
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer>
          <button type="button" className="dialog-cancel" onClick={onClose} disabled={deleting}>Cancelar</button>
          <button type="button" className="danger-button" disabled={!matches || deleting} onClick={() => void confirmDelete()}>
            {deleting ? 'Excluindo…' : 'Excluir servidor'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ServerProfilePane({
  server,
  canManageServer,
  onServerUpdated,
}: {
  server: Server;
  canManageServer: boolean;
  onServerUpdated: (server: Server) => void;
}) {
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description);
  const [iconDataUrl, setIconDataUrl] = useState(server.iconDataUrl);
  const [accentColor, setAccentColor] = useState<AccentColor | null>(server.accentColor);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [iconError, setIconError] = useState('');
  const iconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(server.name);
    setDescription(server.description);
    setIconDataUrl(server.iconDataUrl);
    setAccentColor(server.accentColor);
  }, [server.id, server.name, server.description, server.iconDataUrl, server.accentColor]);

  const dirty = name.trim() !== server.name || description !== server.description
    || iconDataUrl !== server.iconDataUrl || accentColor !== server.accentColor;

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const { server: updated } = await api.updateServer(server.id, { name: name.trim(), description, iconDataUrl, accentColor });
      onServerUpdated(updated);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível salvar as alterações.');
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setName(server.name);
    setDescription(server.description);
    setIconDataUrl(server.iconDataUrl);
    setAccentColor(server.accentColor);
    setError('');
  }

  async function handleIconFile(file: File | undefined) {
    if (!file) return;
    setIconError('');
    try {
      setIconDataUrl(await fileToResizedDataUrl(file, 256, AVATAR_DATA_URL_MAX_LENGTH, true));
    } catch {
      setIconError('Não foi possível usar essa imagem. Tente um arquivo menor.');
    }
  }

  const iconGlyph = name.charAt(0).toUpperCase() || 'S';

  return (
    <div className="server-profile-page">
      <div className="server-page-title">
        <div><h1>Perfil do servidor</h1><p>Personalize a aparência e a identidade do seu servidor.</p></div>
      </div>
      <div className="server-profile-columns">
        <div className="server-profile-form">
          <section className="server-settings-card server-identity-card">
            {iconDataUrl ? <img className="server-icon-large" src={iconDataUrl} alt="" draggable={false} /> : <div className="server-icon-large">{iconGlyph}</div>}
            <div className="server-name-fields">
              <label>
                Nome do servidor
                <input
                  value={name}
                  maxLength={SERVER_NAME_MAX_LENGTH}
                  disabled={!canManageServer}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                Descrição
                <textarea
                  rows={3}
                  value={description}
                  maxLength={SERVER_DESCRIPTION_MAX_LENGTH}
                  disabled={!canManageServer}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
            </div>
          </section>
          {canManageServer && (
            <section className="server-settings-card">
              <span className="field-eyebrow">Ícone</span>
              <p className="settings-hint">Recomendado: pelo menos 512×512.</p>
              <input ref={iconInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
                onChange={(event) => void handleIconFile(event.target.files?.[0])} />
              <div className="server-form-actions" style={{ marginTop: 10 }}>
                <button type="button" className="secondary-pill" onClick={() => iconInputRef.current?.click()}>
                  <ImageIcon size={13} /> Alterar ícone
                </button>
                {iconDataUrl && (
                  <button type="button" className="secondary-pill" onClick={() => setIconDataUrl('')}>Remover ícone</button>
                )}
              </div>
              {iconError && <p className="form-error" role="alert">{iconError}</p>}
            </section>
          )}
          <section className="server-settings-card">
            <span className="field-eyebrow">Faixa</span>
            <div className="accent-picker" role="radiogroup" aria-label="Cor da faixa do servidor">
              {ACCENT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={accentColor === color}
                  aria-label={`Cor ${color}`}
                  className={`accent-swatch ${accentColor === color ? 'selected' : ''}`}
                  data-color={color}
                  disabled={!canManageServer}
                  onClick={() => setAccentColor(accentColor === color ? null : color)}
                />
              ))}
            </div>
          </section>
          {error && <p className="form-error" role="alert">{error}</p>}
          {canManageServer && (
            <div className="server-form-actions">
              <button type="button" className="secondary-pill" onClick={discard} disabled={!dirty || saving}>Descartar</button>
              <button type="button" className="violet-primary" onClick={() => void save()} disabled={!dirty || saving || !name.trim()}>
                {saving ? 'Salvando…' : 'Salvar alterações'}
              </button>
            </div>
          )}
        </div>
        <aside className="server-live-preview">
          <span className="field-eyebrow">Pré-visualização</span>
          <div className="server-preview-card">
            <div className="server-preview-banner" style={accentColor ? { background: accentColor } : undefined}>
              {!accentColor && <><i /><i /><i /></>}
            </div>
            <div className="server-preview-body">
              {iconDataUrl ? <img className="server-icon-large" src={iconDataUrl} alt="" draggable={false} /> : <span className="server-icon-large">{iconGlyph}</span>}
              <h2>{name || server.name}</h2>
              <p>{description}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function InvitesPane({ serverId, canManageServer }: { serverId: string; canManageServer: boolean }) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!canManageServer) {
      setLoading(false);
      return;
    }
    let active = true;
    void api.getServerInvite(serverId).then(({ invite }) => { if (active) setInvite(invite); })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar o convite.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [serverId, canManageServer]);

  async function regenerate() {
    if (!window.confirm('Gerar um novo código invalida o código atual. Continuar?')) return;
    setError('');
    try {
      const { invite: next } = await api.regenerateServerInvite(serverId);
      setInvite(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível gerar um novo código.');
    }
  }

  async function copyCode() {
    if (!invite) return;
    setError('');
    if (await copyText(invite.code)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } else {
      setError('Não foi possível copiar o código. Selecione e copie manualmente.');
    }
  }

  if (!canManageServer) {
    return (
      <div className="invites-page">
        <div className="server-page-title">
          <div><h1>Convites</h1><p>Só quem gerencia o servidor pode ver e gerar convites.</p></div>
        </div>
      </div>
    );
  }

  return (
    <div className="invites-page">
      <div className="server-page-title">
        <div><h1>Convites</h1><p>Compartilhe este código para que outras pessoas entrem no servidor.</p></div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? (
        <p>Carregando…</p>
      ) : invite ? (
        <section className="server-settings-card invite-code-card">
          <span className="field-eyebrow">Código de convite</span>
          <div className="invite-code-row">
            <code>{invite.code}</code>
            <button type="button" className="secondary-pill" onClick={copyCode}>
              <CopyIcon size={14} /> {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
          <p>Usado {invite.uses} {invite.uses === 1 ? 'vez' : 'vezes'} — sem limite de usos nem expiração por enquanto.</p>
          <button type="button" className="secondary-pill" onClick={() => void regenerate()}>Gerar novo código</button>
        </section>
      ) : (
        <p>Não foi possível carregar o convite.</p>
      )}
    </div>
  );
}

type RoleTab = 'display' | 'permissions' | 'members';

function RolesPane({ serverId, member }: { serverId: string; member: ServerMember }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [tab, setTab] = useState<RoleTab>('display');
  const [creating, setCreating] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [error, setError] = useState('');
  const [memberSearch, setMemberSearch] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([api.getRoles(serverId), api.getMembers(serverId)]).then(([rolesResult, membersResult]) => {
      if (!active) return;
      setRoles(rolesResult.roles);
      setMembers(membersResult.members);
      setSelectedRoleId((current) => current ?? rolesResult.roles[0]?.id ?? null);
    });
    const unsubscribe = onRealtimeEvent((event) => {
      if (event.type === 'ROLE_CREATE' && event.serverId === serverId) {
        setRoles((current) => [...current, event.role].sort((left, right) => right.position - left.position));
      } else if (event.type === 'ROLE_UPDATE' && event.serverId === serverId) {
        setRoles((current) => current.map((role) => (role.id === event.role.id ? event.role : role)));
      } else if (event.type === 'ROLE_DELETE' && event.serverId === serverId) {
        setRoles((current) => current.filter((role) => role.id !== event.roleId));
        setSelectedRoleId((current) => (current === event.roleId ? null : current));
      } else if (event.type === 'MEMBER_ROLES_UPDATE' && event.serverId === serverId) {
        setMembers((current) =>
          current.map((candidate) => (candidate.id === event.userId ? { ...candidate, roleIds: event.roleIds } : candidate)),
        );
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [serverId]);

  const ownPosition = useMemo(() => highestPosition(member.roleIds, roles), [member.roleIds, roles]);
  const canManageRoles = hasPermission(member.permissions, Permission.MANAGE_ROLES);
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;
  const canEditSelected = Boolean(selectedRole) && canManageRoles && selectedRole!.position < ownPosition;

  async function createRole() {
    if (!newRoleName.trim()) return;
    setError('');
    try {
      const { role } = await api.createRole(
        serverId,
        newRoleName.trim(),
        ROLE_COLOR_SWATCHES[roles.length % ROLE_COLOR_SWATCHES.length] ?? '#7c6ff2',
        0,
        false,
      );
      setRoles((current) => [...current, role].sort((left, right) => right.position - left.position));
      setSelectedRoleId(role.id);
      setTab('display');
      setNewRoleName('');
      setCreating(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível criar o cargo.');
    }
  }

  async function patchSelectedRole(patch: { name?: string; color?: string; permissions?: number; hoist?: boolean }) {
    if (!selectedRole) return;
    setError('');
    try {
      const { role } = await api.updateRole(serverId, selectedRole.id, patch);
      setRoles((current) => current.map((candidate) => (candidate.id === role.id ? role : candidate)));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível atualizar o cargo.');
    }
  }

  async function removeSelectedRole() {
    if (!selectedRole || selectedRole.isEveryone) return;
    if (!window.confirm(`Apagar o cargo "${selectedRole.name}"? Essa ação não pode ser desfeita.`)) return;
    try {
      await api.deleteRole(serverId, selectedRole.id);
      setRoles((current) => current.filter((role) => role.id !== selectedRole.id));
      setSelectedRoleId(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível apagar o cargo.');
    }
  }

  async function toggleMemberInRole(userId: string, hasRole: boolean) {
    if (!selectedRole) return;
    try {
      if (hasRole) {
        await api.unassignRole(serverId, selectedRole.id, userId);
        setMembers((current) =>
          current.map((candidate) =>
            candidate.id === userId ? { ...candidate, roleIds: candidate.roleIds.filter((id) => id !== selectedRole.id) } : candidate,
          ),
        );
      } else {
        await api.assignRole(serverId, selectedRole.id, userId);
        setMembers((current) =>
          current.map((candidate) => (candidate.id === userId ? { ...candidate, roleIds: [...candidate.roleIds, selectedRole.id] } : candidate)),
        );
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível alterar a atribuição do cargo.');
    }
  }

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, typeof PERMISSION_DEFINITIONS>();
    for (const definition of PERMISSION_DEFINITIONS) {
      const list = groups.get(definition.category) ?? [];
      list.push(definition);
      groups.set(definition.category, list);
    }
    return [...groups.entries()];
  }, []);

  const filteredMembers = members.filter((candidate) => candidate.displayName.toLowerCase().includes(memberSearch.trim().toLowerCase()));

  return (
    <div className="roles-page">
      <div className="server-page-title">
        <div><h1>Cargos</h1><p>Use cargos para organizar os membros e controlar permissões.</p></div>
        {canManageRoles && (
          <button type="button" className="violet-primary" onClick={() => setCreating((current) => !current)}>
            <PlusIcon size={15} /> Criar cargo
          </button>
        )}
      </div>
      {creating && (
        <div className="role-create-row">
          <input
            value={newRoleName}
            maxLength={ROLE_NAME_MAX_LENGTH}
            placeholder="Nome do novo cargo"
            onChange={(event) => setNewRoleName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void createRole()}
          />
          <button type="button" className="violet-primary" onClick={() => void createRole()}>Criar</button>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="roles-workspace">
        <aside className="roles-list">
          <label className="roles-search"><SearchIcon size={14} /><input readOnly placeholder="Buscar cargos" /></label>
          <span className="field-eyebrow">Cargos — {roles.length}</span>
          {roles.map((role) => {
            const memberCount = members.filter((candidate) => candidate.roleIds.includes(role.id)).length;
            return (
              <button
                type="button"
                key={role.id}
                className={role.id === selectedRoleId ? 'active' : ''}
                onClick={() => {
                  setSelectedRoleId(role.id);
                  setTab('display');
                }}
              >
                <i style={{ background: role.color }} />
                <span><strong>{role.name}</strong><small>{memberCount} membro{memberCount === 1 ? '' : 's'}</small></span>
              </button>
            );
          })}
        </aside>
        {selectedRole ? (
          <section className="role-editor">
            <div className="role-editor-heading">
              <div>
                <span className="role-color-dot" style={{ background: selectedRole.color }} />
                <h2>{selectedRole.name}</h2>
                <small>{members.filter((candidate) => candidate.roleIds.includes(selectedRole.id)).length} membros</small>
              </div>
              {canEditSelected && !selectedRole.isEveryone && (
                <button type="button" onClick={() => void removeSelectedRole()} aria-label="Apagar cargo">
                  <TrashIcon size={14} />
                </button>
              )}
            </div>
            <div className="role-tabs">
              <button type="button" className={tab === 'display' ? 'active' : ''} onClick={() => setTab('display')}>Exibição</button>
              <button type="button" className={tab === 'permissions' ? 'active' : ''} onClick={() => setTab('permissions')}>Permissões</button>
              <button type="button" className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>Gerenciar membros</button>
            </div>

            {tab === 'display' && (
              <>
                <div className="role-fields-grid">
                  <label>
                    Nome do cargo
                    <input
                      value={selectedRole.name}
                      disabled={!canEditSelected || selectedRole.isEveryone}
                      maxLength={ROLE_NAME_MAX_LENGTH}
                      onChange={(event) => setRoles((current) => current.map((role) => (role.id === selectedRole.id ? { ...role, name: event.target.value } : role)))}
                      onBlur={(event) => void patchSelectedRole({ name: event.target.value.trim() || selectedRole.name })}
                    />
                  </label>
                  <label>
                    Cor do cargo
                    <div className="static-swatches" aria-label="Cor do cargo">
                      {ROLE_COLOR_SWATCHES.map((color) => (
                        <button
                          key={color}
                          type="button"
                          disabled={!canEditSelected}
                          className={color === selectedRole.color ? 'selected' : ''}
                          style={{ background: color }}
                          aria-label={`Cor ${color}`}
                          onClick={() => void patchSelectedRole({ color })}
                        />
                      ))}
                    </div>
                  </label>
                </div>
                {!selectedRole.isEveryone && (
                  <div className="role-static-toggle">
                    <div><strong>Exibir membros do cargo separadamente</strong><span>Mostra este cargo como um grupo próprio na lista de membros.</span></div>
                    <button
                      type="button"
                      disabled={!canEditSelected}
                      className={`static-switch${selectedRole.hoist ? ' on' : ''}`}
                      onClick={() => void patchSelectedRole({ hoist: !selectedRole.hoist })}
                    />
                  </div>
                )}
              </>
            )}

            {tab === 'permissions' && (
              <>
                <div className="permissions-heading">
                  <div><h3>Permissões</h3><p>Defina o que os membros deste cargo podem fazer.</p></div>
                </div>
                {isFlagSet(selectedRole.permissions, Permission.ADMINISTRATOR) && (
                  <p className="role-admin-note">Administrador concede todas as permissões — as demais opções abaixo ficam irrelevantes.</p>
                )}
                {groupedPermissions.map(([category, definitions]) => (
                  <div className="permission-group" key={category}>
                    <span className="field-eyebrow">{category}</span>
                    {definitions.map((definition) => (
                      <div className="permission-row" key={definition.flag}>
                        <span title={definition.description}>{definition.label}</span>
                        <button
                          type="button"
                          disabled={!canEditSelected}
                          className={`static-switch${isFlagSet(selectedRole.permissions, definition.flag) ? ' on' : ''}`}
                          onClick={() =>
                            void patchSelectedRole({
                              permissions: isFlagSet(selectedRole.permissions, definition.flag)
                                ? selectedRole.permissions & ~definition.flag
                                : selectedRole.permissions | definition.flag,
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}

            {tab === 'members' && (
              <>
                <div className="permissions-heading">
                  <div><h3>Gerenciar membros</h3><p>Escolha quem tem o cargo {selectedRole.name}.</p></div>
                  <label className="roles-search">
                    <SearchIcon size={14} />
                    <input placeholder="Buscar membro" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} />
                  </label>
                </div>
                {selectedRole.isEveryone ? (
                  <p className="role-admin-note">Todo mundo tem @everyone automaticamente — não dá pra atribuir ou remover manualmente.</p>
                ) : (
                  <div className="role-member-list">
                    {filteredMembers.map((candidate) => {
                      const hasRole = candidate.roleIds.includes(selectedRole.id);
                      return (
                        <div className="permission-row" key={candidate.id}>
                          <span>{candidate.displayName}</span>
                          <button
                            type="button"
                            disabled={!canEditSelected}
                            className={`static-switch${hasRole ? ' on' : ''}`}
                            onClick={() => void toggleMemberInRole(candidate.id, hasRole)}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          <section className="role-editor"><p>Selecione um cargo à esquerda.</p></section>
        )}
      </div>
    </div>
  );
}

type ModerationMenuState = { userId: string; mode: 'timeout' | 'ban' } | null;

const TIMEOUT_PRESETS = [
  { label: '5 minutos', minutes: 5 },
  { label: '10 minutos', minutes: 10 },
  { label: '1 hora', minutes: 60 },
  { label: '1 dia', minutes: 60 * 24 },
  { label: '7 dias', minutes: 60 * 24 * 7 },
];

function MembersPane({ serverId, member }: { serverId: string; member: ServerMember }) {
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [bans, setBans] = useState<BanRecord[]>([]);
  const [search, setSearch] = useState('');
  const [menu, setMenu] = useState<ModerationMenuState>(null);
  const [banReason, setBanReason] = useState('');
  const [feedback, setFeedback] = useState('');

  const canKick = hasPermission(member.permissions, Permission.KICK_MEMBERS);
  const canBan = hasPermission(member.permissions, Permission.BAN_MEMBERS);
  const canTimeout = hasPermission(member.permissions, Permission.MODERATE_MEMBERS);
  const ownPosition = useMemo(() => highestPosition(member.roleIds, roles), [member.roleIds, roles]);

  useEffect(() => {
    let active = true;
    void Promise.all([api.getMembers(serverId), api.getRoles(serverId)]).then(([membersResult, rolesResult]) => {
      if (!active) return;
      setMembers(membersResult.members);
      setRoles(rolesResult.roles);
    });
    if (canBan) void api.getBans(serverId).then((result) => active && setBans(result.bans));
    const unsubscribe = onRealtimeEvent((event) => {
      if (event.type === 'MEMBER_ROLES_UPDATE' && event.serverId === serverId) {
        setMembers((current) => current.map((candidate) => (candidate.id === event.userId ? { ...candidate, roleIds: event.roleIds } : candidate)));
      } else if (event.type === 'MEMBER_TIMEOUT_UPDATE' && event.serverId === serverId) {
        setMembers((current) =>
          current.map((candidate) => (candidate.id === event.userId ? { ...candidate, timeoutUntil: event.timeoutUntil } : candidate)),
        );
      } else if (event.type === 'MEMBER_BANNED') {
        setMembers((current) => current.filter((candidate) => candidate.id !== event.userId));
      } else if (event.type === 'MEMBER_LEAVE' && event.serverId === serverId) {
        setMembers((current) => current.filter((candidate) => candidate.id !== event.userId));
      } else if (event.type === 'MEMBER_JOIN' && event.serverId === serverId) {
        setMembers((current) => (current.some((candidate) => candidate.id === event.member.id) ? current : [...current, event.member]));
      } else if (event.type === 'ROLE_CREATE' && event.serverId === serverId) {
        setRoles((current) => [...current, event.role]);
      } else if (event.type === 'ROLE_UPDATE' && event.serverId === serverId) {
        setRoles((current) => current.map((role) => (role.id === event.role.id ? event.role : role)));
      } else if (event.type === 'ROLE_DELETE' && event.serverId === serverId) {
        setRoles((current) => current.filter((role) => role.id !== event.roleId));
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [serverId, canBan]);

  function targetPosition(candidate: MemberSummary): number {
    return highestPosition(candidate.roleIds, roles);
  }

  function canModerate(candidate: MemberSummary): boolean {
    return candidate.id !== member.userId && targetPosition(candidate) < ownPosition;
  }

  async function runAction(promise: Promise<unknown>, successMessage: string) {
    setFeedback('');
    try {
      await promise;
      setFeedback(successMessage);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Não foi possível concluir a ação.');
    }
  }

  const filtered = members.filter((candidate) => candidate.displayName.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="members-page">
      <div className="server-page-title">
        <div><h1>Membros</h1><p>Veja quem faz parte do servidor e aplique moderação quando necessário.</p></div>
      </div>
      <label className="roles-search members-search">
        <SearchIcon size={14} />
        <input placeholder="Buscar membro" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      {feedback && <p className="form-error" role="status">{feedback}</p>}
      <div className="member-roster">
        {filtered.map((candidate) => {
          const isTimedOut = Boolean(candidate.timeoutUntil && candidate.timeoutUntil > Date.now());
          const memberRoles = roles.filter((role) => !role.isEveryone && candidate.roleIds.includes(role.id));
          const showMenu = menu?.userId === candidate.id;
          return (
            <div className="member-roster-row" key={candidate.id}>
              <div className="member-roster-identity">
                <span className="member-roster-name">{candidate.displayName}</span>
                <div className="member-roster-roles">
                  {memberRoles.map((role) => (
                    <span key={role.id} className="role-chip" style={{ borderColor: role.color, color: role.color }}>{role.name}</span>
                  ))}
                  {isTimedOut && candidate.timeoutUntil && (
                    <span className="role-chip role-chip-timeout">Silenciado até {formatTimeoutUntil(candidate.timeoutUntil)}</span>
                  )}
                </div>
              </div>
              {canModerate(candidate) && (canKick || canBan || canTimeout) && (
                <div className="member-roster-actions">
                  {canKick && (
                    <button
                      type="button"
                      className="secondary-pill"
                      onClick={() => void runAction(api.voiceKickMember(serverId, candidate.id), `${candidate.displayName} foi expulso da chamada de voz.`)}
                    >
                      Expulsar da voz
                    </button>
                  )}
                  {canTimeout && !isTimedOut && (
                    <button type="button" className="secondary-pill" onClick={() => setMenu({ userId: candidate.id, mode: 'timeout' })}>
                      Timeout
                    </button>
                  )}
                  {canTimeout && isTimedOut && (
                    <button
                      type="button"
                      className="secondary-pill"
                      onClick={() => void runAction(api.clearMemberTimeout(serverId, candidate.id), `Timeout de ${candidate.displayName} removido.`)}
                    >
                      Remover timeout
                    </button>
                  )}
                  {canBan && (
                    <button type="button" className="secondary-pill danger-pill" onClick={() => setMenu({ userId: candidate.id, mode: 'ban' })}>
                      Banir
                    </button>
                  )}
                </div>
              )}
              {showMenu && menu.mode === 'timeout' && (
                <div className="moderation-inline-menu">
                  {TIMEOUT_PRESETS.map((preset) => (
                    <button
                      key={preset.minutes}
                      type="button"
                      className="secondary-pill"
                      onClick={() => {
                        void runAction(api.timeoutMember(serverId, candidate.id, preset.minutes), `${candidate.displayName} está em timeout por ${preset.label}.`);
                        setMenu(null);
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button type="button" className="secondary-pill" onClick={() => setMenu(null)}>Cancelar</button>
                </div>
              )}
              {showMenu && menu.mode === 'ban' && (
                <div className="moderation-inline-menu">
                  <input
                    placeholder="Motivo do banimento (opcional)"
                    value={banReason}
                    onChange={(event) => setBanReason(event.target.value)}
                  />
                  <button
                    type="button"
                    className="violet-primary danger-pill"
                    onClick={() => {
                      void runAction(api.banMember(serverId, candidate.id, banReason), `${candidate.displayName} foi banido.`);
                      setMenu(null);
                      setBanReason('');
                    }}
                  >
                    Confirmar banimento
                  </button>
                  <button type="button" className="secondary-pill" onClick={() => setMenu(null)}>Cancelar</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canBan && bans.length > 0 && (
        <div className="banned-members-section">
          <span className="field-eyebrow">Membros banidos — {bans.length}</span>
          {bans.map((ban) => (
            <div className="member-roster-row" key={ban.userId}>
              <div className="member-roster-identity">
                <span className="member-roster-name">{ban.displayName}</span>
                <div className="member-roster-roles">
                  <span className="role-chip role-chip-timeout">{ban.reason || 'Sem motivo informado'}</span>
                  {ban.bannedByName && <span className="role-chip">banido por {ban.bannedByName}</span>}
                </div>
              </div>
              <div className="member-roster-actions">
                <button
                  type="button"
                  className="secondary-pill"
                  onClick={() => {
                    void runAction(api.unbanMember(serverId, ban.userId), `${ban.displayName} foi desbanido.`);
                    setBans((current) => current.filter((entry) => entry.userId !== ban.userId));
                  }}
                >
                  Desbanir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
