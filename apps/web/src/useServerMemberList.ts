import { useEffect, useState } from 'react';
import type { MemberSummary, Role } from '@nexplay/shared';
import { api } from './api';
import { applyMemberEvent, applyPresenceEvent, applyRoleEvent } from './memberListState';
import { onRealtimeConnect, onRealtimeEvent } from './realtime';

// Membros do servidor aberto + cargos + quem deles está online, sempre atualizado:
//  - lê tudo ao abrir o servidor e a cada (re)conexão do tempo real, que cobre
//    qualquer coisa perdida enquanto o app estava sem rede e também traz de volta
//    nome e avatar que a pessoa tenha trocado;
//  - aplica na hora os eventos de entrada, saída, banimento, cargos e presença.
export function useServerMemberList(serverId: string | null) {
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [onlineIds, setOnlineIds] = useState<ReadonlySet<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!serverId) {
      setMembers([]);
      setRoles([]);
      setOnlineIds(new Set());
      setLoading(false);
      setFailed(false);
      return;
    }

    let active = true;
    // Trocar de servidor não pode mostrar por um instante os membros do anterior.
    setMembers([]);
    setRoles([]);
    setOnlineIds(new Set());
    setLoading(true);
    setFailed(false);

    async function refresh() {
      try {
        const [membersResponse, rolesResponse, presenceResponse] = await Promise.all([
          api.getMembers(serverId!),
          api.getRoles(serverId!),
          api.getPresence(serverId!),
        ]);
        if (!active) return;
        setMembers(membersResponse.members);
        setRoles(rolesResponse.roles);
        setOnlineIds(new Set(presenceResponse.onlineUserIds));
        setFailed(false);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void refresh();

    const unsubscribeEvents = onRealtimeEvent((event) => {
      if (event.type === 'MEMBER_UNBANNED') {
        // Quem volta de um banimento precisa da leitura completa (dados e cargos).
        void refresh();
        return;
      }
      setMembers((current) => applyMemberEvent(current, event, serverId));
      setRoles((current) => applyRoleEvent(current, event, serverId));
      setOnlineIds((current) => applyPresenceEvent(current, event));
    });
    const unsubscribeConnect = onRealtimeConnect(() => void refresh());

    return () => {
      active = false;
      unsubscribeEvents();
      unsubscribeConnect();
    };
  }, [serverId]);

  return { members, roles, onlineIds, loading, failed };
}
