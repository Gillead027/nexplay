import { useEffect, useState } from 'react';
import type { MemberSummary } from '@nexplay/shared';
import { api } from './api';
import { applyMemberEvent, applyPresenceEvent } from './memberListState';
import { onRealtimeConnect, onRealtimeEvent } from './realtime';

// Membros do servidor aberto + quem deles está online, sempre atualizado:
//  - lê a lista e a presença ao abrir o servidor e a cada (re)conexão do tempo
//    real, que cobre qualquer coisa perdida enquanto o app estava sem rede e
//    também traz de volta nome e avatar que a pessoa tenha trocado;
//  - aplica na hora os eventos de entrada, saída, banimento e presença.
export function useServerMemberList(serverId: string | null) {
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [onlineIds, setOnlineIds] = useState<ReadonlySet<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!serverId) {
      setMembers([]);
      setOnlineIds(new Set());
      setLoading(false);
      setFailed(false);
      return;
    }

    let active = true;
    // Trocar de servidor não pode mostrar por um instante os membros do anterior.
    setMembers([]);
    setOnlineIds(new Set());
    setLoading(true);
    setFailed(false);

    async function refresh() {
      try {
        const [membersResponse, presenceResponse] = await Promise.all([api.getMembers(serverId!), api.getPresence(serverId!)]);
        if (!active) return;
        setMembers(membersResponse.members);
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
      setOnlineIds((current) => applyPresenceEvent(current, event));
    });
    const unsubscribeConnect = onRealtimeConnect(() => void refresh());

    return () => {
      active = false;
      unsubscribeEvents();
      unsubscribeConnect();
    };
  }, [serverId]);

  return { members, onlineIds, loading, failed };
}
