import { useEffect, useMemo, useState } from 'react';
import {
  CHANNEL_OVERWRITE_FLAGS,
  Permission,
  type ChannelKind,
  type MemberSummary,
  type OverwriteTargetType,
  type PermissionOverwrite,
  type Role,
} from '@nexplay/shared';
import { api } from '../api';
import { CheckIcon, CloseIcon, PlusIcon } from './Icons';

type Target = { type: OverwriteTargetType; id: string };
type FlagState = 'deny' | 'inherit' | 'allow';

function stateOf(overwrite: PermissionOverwrite | undefined, flag: number): FlagState {
  if (!overwrite) return 'inherit';
  if ((overwrite.deny & flag) !== 0) return 'deny';
  if ((overwrite.allow & flag) !== 0) return 'allow';
  return 'inherit';
}

function withState(overwrite: PermissionOverwrite, flag: number, state: FlagState): PermissionOverwrite {
  const allow = overwrite.allow & ~flag;
  const deny = overwrite.deny & ~flag;
  return { ...overwrite, allow: state === 'allow' ? allow | flag : allow, deny: state === 'deny' ? deny | flag : deny };
}

// "Permissões" de um canal ou categoria, como no Discord: canal privado, a lista de cargos e membros com ajuste e, para
// o selecionado, cada permissão com ✕ (negar), ⧸ (herdar) ou ✓ (permitir). Cada clique já salva.
export function ChannelPermissionsPane({ serverId, kind, channelId }: { serverId: string; kind: ChannelKind; channelId: string }) {
  const [overwrites, setOverwrites] = useState<PermissionOverwrite[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [selected, setSelected] = useState<Target | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setOverwrites(null);
    setForbidden(false);
    void Promise.all([api.getChannelOverwrites(serverId, kind, channelId), api.getRoles(serverId), api.getMembers(serverId)])
      .then(([loaded, roleList, memberList]) => {
        if (!active) return;
        setOverwrites(loaded.overwrites);
        setRoles(roleList.roles);
        setMembers(memberList.members);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        const message = requestError instanceof Error ? requestError.message : '';
        if (/permiss/i.test(message)) setForbidden(true);
        else setError(message || 'Não foi possível carregar as permissões.');
        setOverwrites([]);
      });
    return () => {
      active = false;
    };
  }, [serverId, kind, channelId]);

  const everyone = roles.find((role) => role.isEveryone);
  const flags = CHANNEL_OVERWRITE_FLAGS[kind];

  const find = (target: Target) => overwrites?.find((overwrite) => overwrite.targetType === target.type && overwrite.targetId === target.id);
  const labelOf = (target: Target) =>
    target.type === 'role'
      ? (roles.find((role) => role.id === target.id)?.name ?? 'Cargo apagado')
      : (members.find((member) => member.id === target.id)?.displayName ?? 'Membro');

  // @everyone sempre aparece; depois cargos e membros que têm ajuste.
  const listed = useMemo<Target[]>(() => {
    const result: Target[] = everyone ? [{ type: 'role', id: everyone.id }] : [];
    for (const overwrite of overwrites ?? []) {
      if (overwrite.targetType === 'role' && overwrite.targetId === everyone?.id) continue;
      result.push({ type: overwrite.targetType, id: overwrite.targetId });
    }
    return result;
  }, [overwrites, everyone]);

  const current = selected ?? listed[0] ?? null;
  const isPrivate = everyone ? stateOf(find({ type: 'role', id: everyone.id }), Permission.VIEW_CHANNELS) === 'deny' : false;

  async function save(target: Target, next: PermissionOverwrite) {
    setSaving(true);
    setError('');
    try {
      const result = await api.setChannelOverwrite(serverId, kind, channelId, { ...next, targetType: target.type, targetId: target.id });
      setOverwrites(result.overwrites);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function setFlag(target: Target, flag: number, state: FlagState) {
    const base = find(target) ?? { targetType: target.type, targetId: target.id, allow: 0, deny: 0 };
    await save(target, withState(base, flag, state));
  }

  async function remove(target: Target) {
    setSaving(true);
    setError('');
    try {
      const result = await api.deleteChannelOverwrite(serverId, kind, channelId, target.type, target.id);
      setOverwrites(result.overwrites);
      setSelected(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível remover.');
    } finally {
      setSaving(false);
    }
  }

  async function add(target: Target) {
    setAdding(false);
    setSelected(target);
    // Entra na lista já liberando ver (o uso mais comum: abrir um canal privado para um cargo ou pessoa).
    await setFlag(target, Permission.VIEW_CHANNELS, 'allow');
  }

  if (forbidden) {
    return <p className="channel-settings-stub">Você precisa da permissão Gerenciar cargos para mudar as permissões deste canal.</p>;
  }
  if (overwrites === null) return <p className="channel-settings-stub">Carregando permissões…</p>;

  const addableRoles = roles.filter((role) => !role.isEveryone && !find({ type: 'role', id: role.id }));
  const addableMembers = members.filter((member) => !find({ type: 'member', id: member.id }));
  const currentOverwrite = current ? find(current) : undefined;

  return (
    <div className="channel-permissions">
      {everyone && (
        <div className="channel-permissions-private">
          <div>
            <strong>{kind === 'category' ? 'Categoria privada' : 'Canal privado'}</strong>
            <p>Só os cargos e membros que você escolher abaixo vão ver {kind === 'category' ? 'os canais desta categoria' : 'este canal'}.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isPrivate}
            className={`settings-switch ${isPrivate ? 'on' : ''}`}
            disabled={saving}
            onClick={() => void setFlag({ type: 'role', id: everyone.id }, Permission.VIEW_CHANNELS, isPrivate ? 'inherit' : 'deny')}
          >
            <span className="sr-only">{kind === 'category' ? 'Categoria privada' : 'Canal privado'}</span>
          </button>
        </div>
      )}

      <div className="channel-permissions-body">
        <aside className="channel-permissions-targets">
          <header>
            <span>Cargos/Membros</span>
            <button type="button" aria-label="Adicionar cargo ou membro" title="Adicionar cargo ou membro" onClick={() => setAdding((open) => !open)}>
              <PlusIcon size={16} />
            </button>
          </header>
          {adding && (
            <div className="channel-permissions-add" role="menu">
              {addableRoles.length > 0 && <span className="channel-permissions-add-title">Cargos</span>}
              {addableRoles.map((role) => (
                <button key={role.id} type="button" role="menuitem" onClick={() => void add({ type: 'role', id: role.id })}>
                  <i className="role-color-dot" style={{ background: role.color }} /> {role.name}
                </button>
              ))}
              {addableMembers.length > 0 && <span className="channel-permissions-add-title">Membros</span>}
              {addableMembers.map((member) => (
                <button key={member.id} type="button" role="menuitem" onClick={() => void add({ type: 'member', id: member.id })}>
                  @{member.displayName}
                </button>
              ))}
              {addableRoles.length === 0 && addableMembers.length === 0 && <p>Todos já estão na lista.</p>}
            </div>
          )}
          {listed.map((target) => (
            <button
              key={`${target.type}-${target.id}`}
              type="button"
              className={current && current.type === target.type && current.id === target.id ? 'active' : ''}
              onClick={() => setSelected(target)}
            >
              {target.type === 'role'
                ? <i className="role-color-dot" style={{ background: roles.find((role) => role.id === target.id)?.color ?? '#99aab5' }} />
                : <span className="channel-permissions-at">@</span>}
              {labelOf(target)}
            </button>
          ))}
        </aside>

        {current && (
          <section className="channel-permissions-flags" aria-label={`Permissões de ${labelOf(current)}`}>
            <h3>
              {kind === 'category' ? 'Permissões da categoria' : 'Permissões do canal'} — {labelOf(current)}
            </h3>
            {flags.map(({ flag, label, description }) => {
              const state = stateOf(currentOverwrite, flag);
              return (
                <div className="channel-permissions-row" key={flag}>
                  <div>
                    <strong>{label}</strong>
                    <p>{description}</p>
                  </div>
                  <div className="tri-state" role="radiogroup" aria-label={label}>
                    <button type="button" role="radio" aria-checked={state === 'deny'} aria-label="Negar" title="Negar"
                      className={`deny ${state === 'deny' ? 'on' : ''}`} disabled={saving} onClick={() => void setFlag(current, flag, 'deny')}>
                      <CloseIcon size={14} />
                    </button>
                    <button type="button" role="radio" aria-checked={state === 'inherit'} aria-label="Herdar" title="Herdar"
                      className={`inherit ${state === 'inherit' ? 'on' : ''}`} disabled={saving} onClick={() => void setFlag(current, flag, 'inherit')}>
                      /
                    </button>
                    <button type="button" role="radio" aria-checked={state === 'allow'} aria-label="Permitir" title="Permitir"
                      className={`allow ${state === 'allow' ? 'on' : ''}`} disabled={saving} onClick={() => void setFlag(current, flag, 'allow')}>
                      <CheckIcon size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
            {!(current.type === 'role' && current.id === everyone?.id) && currentOverwrite && (
              <button type="button" className="danger-link channel-permissions-remove" disabled={saving} onClick={() => void remove(current)}>
                Remover {current.type === 'role' ? 'cargo' : 'membro'} da lista
              </button>
            )}
          </section>
        )}
      </div>
      {kind !== 'category' && (
        <p className="channel-permissions-note">Sem nenhum ajuste aqui, o canal segue as permissões da categoria dele.</p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
