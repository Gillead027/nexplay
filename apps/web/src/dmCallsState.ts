import { useCallback, useEffect, useRef, useState } from 'react';
import { DM_CALL_SERVER_ID, type DmCallInfo, type RealtimeEvent, type VoiceChannel } from '@nexplay/shared';
import { api } from './api';
import { onRealtimeConnect, onRealtimeEvent } from './realtime';

// Ligações individuais (voz entre dois amigos) no app: o que está chamando ou em andamento, avisos de ligação perdida e recusada, e a
// ponte com a chamada de voz (uma ligação usa o mesmo motor de voz dos canais, com uma sala própria).

/** Ligação com o começo já convertido para o relógio deste computador (null enquanto chama). */
export interface DmCallView extends DmCallInfo {
  startedAtLocal: number | null;
}
export type DmCalls = Record<string, DmCallView>;

export type DmCallEvent = Extract<RealtimeEvent, { type: 'DM_CALL_UPDATE' }>;
export type DmCallFinish = 'ended' | 'declined' | 'missed';

export function stampDmCall(info: DmCallInfo, receivedAt: number = Date.now()): DmCallView {
  return { ...info, startedAtLocal: typeof info.elapsedMs === 'number' ? receivedAt - info.elapsedMs : null };
}

/** Aplica um aviso do servidor. `finished` vem preenchido quando a ligação acabou (e como), para o app reagir. */
export function applyDmCallEvent(
  calls: DmCalls,
  event: DmCallEvent,
  receivedAt: number = Date.now(),
): { calls: DmCalls; finished: { call: DmCallView; how: DmCallFinish } | null } {
  if (event.status === 'ringing' || event.status === 'active') {
    const info: DmCallInfo = { dmChannelId: event.dmChannelId, callerId: event.callerId, calleeId: event.calleeId, status: event.status, elapsedMs: event.elapsedMs };
    return { calls: { ...calls, [event.dmChannelId]: stampDmCall(info, receivedAt) }, finished: null };
  }
  const previous = calls[event.dmChannelId];
  const { [event.dmChannelId]: _removed, ...rest } = calls;
  void _removed;
  return { calls: rest, finished: previous ? { call: previous, how: event.status } : null };
}

/** A primeira ligação que está chamando ESTA pessoa (e ela ainda não atendeu). */
export function incomingDmCall(calls: DmCalls, ownId: string): DmCallView | null {
  return Object.values(calls).find((call) => call.status === 'ringing' && call.calleeId === ownId) ?? null;
}

/** O "canal de voz" fictício de uma ligação, para usar o mesmo motor de voz dos canais. */
export function dmCallChannel(dmChannelId: string, otherName: string): VoiceChannel {
  return {
    id: dmChannelId,
    serverId: DM_CALL_SERVER_ID,
    categoryId: null,
    name: `Ligação com ${otherName}`,
    description: 'Ligação individual',
    slowModeSeconds: 0,
    contentVisibility: 'default',
    bitrateKbps: 0,
    videoQuality: 'auto',
    userLimit: 2,
    createdBy: null,
    createdAt: 0,
  };
}

export const isDmCallChannel = (channel: Pick<VoiceChannel, 'serverId'> | null | undefined): boolean => channel?.serverId === DM_CALL_SERVER_ID;

/** O aviso que a pessoa deve ver quando uma ligação acaba (null = final normal, sem aviso). */
export function finishedCallNotice(finished: { call: DmCallView; how: DmCallFinish }, ownId: string, otherName: string): string | null {
  const { call, how } = finished;
  const wasCaller = call.callerId === ownId;
  if (how === 'declined') return wasCaller ? `${otherName} recusou a ligação.` : null;
  if (how === 'missed') return wasCaller ? `${otherName} não atendeu.` : `Ligação perdida de ${otherName}.`;
  // Encerrada enquanto ainda chamava: quem ligou desistiu (para quem recebia, é uma ligação perdida).
  if (call.status === 'ringing') return wasCaller ? null : `Ligação perdida de ${otherName}.`;
  return null;
}

export interface DmCallsController {
  calls: DmCalls;
  incoming: DmCallView | null;
  start: (dmChannelId: string) => Promise<void>;
  accept: (dmChannelId: string) => Promise<void>;
  decline: (dmChannelId: string) => Promise<void>;
  end: (dmChannelId: string) => Promise<void>;
}

/** O estado das ligações da pessoa: lido ao abrir/reconectar e mantido pelos avisos em tempo real. */
export function useDmCalls(ownId: string, onFinished: (finished: { call: DmCallView; how: DmCallFinish }) => void): DmCallsController {
  const [calls, setCalls] = useState<DmCalls>({});
  const callsRef = useRef<DmCalls>({});
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const replace = useCallback((next: DmCalls) => {
    callsRef.current = next;
    setCalls(next);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void api.getMyDmCalls().then(({ calls: listed }) => {
        if (!active) return;
        const now = Date.now();
        replace(Object.fromEntries(listed.map((call) => [call.dmChannelId, stampDmCall(call, now)])));
      }).catch(() => undefined);
    };
    refresh();
    const unsubscribeConnect = onRealtimeConnect(refresh);
    const unsubscribeEvent = onRealtimeEvent((event) => {
      if (event.type !== 'DM_CALL_UPDATE') return;
      const result = applyDmCallEvent(callsRef.current, event);
      replace(result.calls);
      if (result.finished) onFinishedRef.current(result.finished);
    });
    return () => {
      active = false;
      unsubscribeConnect();
      unsubscribeEvent();
    };
  }, [replace]);

  const start = useCallback(async (dmChannelId: string) => {
    const { call } = await api.startDmCall(dmChannelId);
    replace({ ...callsRef.current, [dmChannelId]: stampDmCall(call) });
  }, [replace]);
  const accept = useCallback(async (dmChannelId: string) => {
    const { call } = await api.acceptDmCall(dmChannelId);
    replace({ ...callsRef.current, [dmChannelId]: stampDmCall(call) });
  }, [replace]);
  const remove = useCallback((dmChannelId: string) => {
    const { [dmChannelId]: _removed, ...rest } = callsRef.current;
    void _removed;
    replace(rest);
  }, [replace]);
  const decline = useCallback(async (dmChannelId: string) => {
    await api.declineDmCall(dmChannelId);
    remove(dmChannelId);
  }, [remove]);
  const end = useCallback(async (dmChannelId: string) => {
    await api.endDmCall(dmChannelId);
    remove(dmChannelId);
  }, [remove]);

  return { calls, incoming: incomingDmCall(calls, ownId), start, accept, decline, end };
}
