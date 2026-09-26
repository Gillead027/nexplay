import { useEffect, useMemo, useState } from 'react';
import type { Activity, MemberSummary, PresenceStatus, Role } from '@nexplay/shared';
import { activitiesFromResponse, applyActivityEvent } from './activityState';
import { api } from './api';
import { applyMemberEvent, applyRoleEvent } from './memberListState';
import { applyPresenceStatusEvent, presenceFromResponse } from './presenceStatus';
import { onRealtimeConnect, onRealtimeEvent } from './realtime';

// Membros do servidor aberto + cargos + quem deles está online, sempre atualizado:
//  - lê tudo ao abrir o servidor e a cada (re)conexão do tempo real, que cobre
//    qualquer coisa perdida enquanto o app estava sem rede e também traz de volta
//    nome e avatar que a pessoa tenha trocado;
//  - aplica na hora os eventos de entrada, saída, banimento, cargos e presença.
export function useServerMemberList(serverId: string | null) {
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  // Quem está visível e o que mostra (online, ausente, não perturbe). Invisível e offline não aparecem aqui.
  const [statuses, setStatuses] = useState<ReadonlyMap<string, PresenceStatus>>(() => new Map());
  // O que quem está visível joga ou ouve agora (mostrado embaixo do nome na lista).
  const [activities, setActivities] = useState<ReadonlyMap<string, Activity>>(() => new Map());
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!serverId) {
      setMembers([]);
      setRoles([]);
      setStatuses(new Map());
      setActivities(new Map());
      setLoading(false);
      setFailed(false);
      return;
    }

    let active = true;
    // Trocar de servidor não pode mostrar por um instante os membros do anterior.
    setMembers([]);
    setRoles([]);
    setStatuses(new Map());
    setActivities(new Map());
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
        setStatuses(presenceFromResponse(presenceResponse));
        setActivities(activitiesFromResponse(presenceResponse));
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
      setStatuses((current) => applyPresenceStatusEvent(current, event));
      setActivities((current) => applyActivityEvent(current, event));
    });
    const unsubscribeConnect = onRealtimeConnect(() => void refresh());

    return () => {
      active = false;
      unsubscribeEvents();
      unsubscribeConnect();
    };
  }, [serverId]);

  const onlineIds = useMemo<ReadonlySet<string>>(() => new Set(statuses.keys()), [statuses]);
  return { members, roles, onlineIds, statuses, activities, loading, failed };
}

export type ServerMemberListData = ReturnType<typeof useServerMemberList>;
