// Ligações individuais (chamada de voz entre dois amigos, pela aba de amigos): o estado de cada ligação — "chamando" (o outro ainda
// não atendeu) e "em andamento" — fica só na memória do servidor, sem banco: uma ligação é passageira, e se a API reiniciar no meio
// de uma que já está em andamento a mídia (LiveKit) continua; só o aviso de "chamando" se perde (quem liga desiste em 45 s).
// Esta classe só decide as regras (quem pode fazer o quê, ocupado, tempo de toque); o envio de eventos e o LiveKit ficam em index.ts.

export const DM_CALL_RING_MS = 45_000;

/** O nome da sala no LiveKit de uma ligação: o prefixo separa das salas dos canais de voz dos servidores. */
export const DM_ROOM_PREFIX = 'dm-';
export const dmRoomName = (dmChannelId: string): string => `${DM_ROOM_PREFIX}${dmChannelId}`;
export const dmChannelIdFromRoom = (roomName: string): string | null => (roomName.startsWith(DM_ROOM_PREFIX) ? roomName.slice(DM_ROOM_PREFIX.length) : null);

export type DmCallStatus = 'ringing' | 'active';

export interface DmCallState {
  dmChannelId: string;
  callerId: string;
  calleeId: string;
  status: DmCallStatus;
  createdAt: number;
  // Quando o outro atendeu (a ligação começou de fato); null enquanto chama.
  acceptedAt: number | null;
}

export type StartResult =
  | { ok: true; call: DmCallState; created: boolean; autoAccepted: boolean }
  | { ok: false; reason: 'CALLER_BUSY' | 'CALLEE_BUSY' };

export type ActionResult = { ok: true; call: DmCallState } | { ok: false; reason: 'NOT_FOUND' | 'FORBIDDEN' | 'ALREADY_ACTIVE' };

export class DmCallRegistry {
  private readonly byChannel = new Map<string, DmCallState>();
  private readonly byUser = new Map<string, string>();

  constructor(
    private readonly ringMs: number = DM_CALL_RING_MS,
    private readonly now: () => number = Date.now,
  ) {}

  get(dmChannelId: string): DmCallState | undefined {
    return this.byChannel.get(dmChannelId);
  }

  /** As ligações (chamando ou em andamento) em que a pessoa está. */
  forUser(userId: string): DmCallState[] {
    const id = this.byUser.get(userId);
    const call = id ? this.byChannel.get(id) : undefined;
    return call ? [call] : [];
  }

  private index(call: DmCallState): void {
    this.byChannel.set(call.dmChannelId, call);
    this.byUser.set(call.callerId, call.dmChannelId);
    this.byUser.set(call.calleeId, call.dmChannelId);
  }

  private drop(call: DmCallState): void {
    this.byChannel.delete(call.dmChannelId);
    if (this.byUser.get(call.callerId) === call.dmChannelId) this.byUser.delete(call.callerId);
    if (this.byUser.get(call.calleeId) === call.dmChannelId) this.byUser.delete(call.calleeId);
  }

  /**
   * `callerId` liga para `calleeId` pela conversa `dmChannelId`. Se já existe ligação nessa conversa: quem já ligou apenas volta
   * a ela; se é o outro quem liga enquanto está chamando (os dois ligaram ao mesmo tempo), a ligação já é atendida.
   */
  start(dmChannelId: string, callerId: string, calleeId: string): StartResult {
    const existing = this.byChannel.get(dmChannelId);
    if (existing) {
      if (existing.status === 'active') return { ok: true, call: existing, created: false, autoAccepted: false };
      if (existing.callerId === callerId) return { ok: true, call: existing, created: false, autoAccepted: false };
      existing.status = 'active';
      existing.acceptedAt = this.now();
      return { ok: true, call: existing, created: false, autoAccepted: true };
    }
    // Uma ligação por pessoa de cada vez (para ligar para outra, desliga a atual).
    if (this.byUser.has(callerId)) return { ok: false, reason: 'CALLER_BUSY' };
    if (this.byUser.has(calleeId)) return { ok: false, reason: 'CALLEE_BUSY' };
    const call: DmCallState = { dmChannelId, callerId, calleeId, status: 'ringing', createdAt: this.now(), acceptedAt: null };
    this.index(call);
    return { ok: true, call, created: true, autoAccepted: false };
  }

  /** Quem foi chamado atende. */
  accept(dmChannelId: string, userId: string): ActionResult {
    const call = this.byChannel.get(dmChannelId);
    if (!call) return { ok: false, reason: 'NOT_FOUND' };
    if (call.calleeId !== userId) return { ok: false, reason: 'FORBIDDEN' };
    if (call.status === 'active') return { ok: false, reason: 'ALREADY_ACTIVE' };
    call.status = 'active';
    call.acceptedAt = this.now();
    return { ok: true, call };
  }

  /** Quem foi chamado recusa (só enquanto chama). */
  decline(dmChannelId: string, userId: string): ActionResult {
    const call = this.byChannel.get(dmChannelId);
    if (!call) return { ok: false, reason: 'NOT_FOUND' };
    if (call.calleeId !== userId || call.status !== 'ringing') return { ok: false, reason: 'FORBIDDEN' };
    this.drop(call);
    return { ok: true, call };
  }

  /** Um dos dois encerra: quem ligou desiste enquanto chama, ou qualquer um encerra a ligação em andamento. */
  end(dmChannelId: string, userId: string): ActionResult {
    const call = this.byChannel.get(dmChannelId);
    if (!call) return { ok: false, reason: 'NOT_FOUND' };
    if (call.callerId !== userId && call.calleeId !== userId) return { ok: false, reason: 'FORBIDDEN' };
    // Quem foi chamado não "desiste": recusar é outra ação (decline). Cancelar chamando é só de quem ligou.
    if (call.status === 'ringing' && call.callerId !== userId) return { ok: false, reason: 'FORBIDDEN' };
    this.drop(call);
    return { ok: true, call };
  }

  /** A sala do LiveKit esvaziou: a ligação acabou, seja qual for o estado. */
  finish(dmChannelId: string): DmCallState | undefined {
    const call = this.byChannel.get(dmChannelId);
    if (call) this.drop(call);
    return call;
  }

  /** Ligações que chamaram além do tempo e ninguém atendeu: saem do registro e são devolvidas (para avisar "perdida"). */
  expire(): DmCallState[] {
    const limit = this.now() - this.ringMs;
    const expired = [...this.byChannel.values()].filter((call) => call.status === 'ringing' && call.createdAt <= limit);
    for (const call of expired) this.drop(call);
    return expired;
  }

  /** Há quanto tempo a ligação está em andamento (ms), ou null enquanto chama. */
  elapsedMs(call: DmCallState): number | null {
    return call.acceptedAt === null ? null : Math.max(0, this.now() - call.acceptedAt);
  }
}
