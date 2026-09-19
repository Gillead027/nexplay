// Quem está "online" = tem o app aberto, ou seja, ao menos um WebSocket de tempo
// real conectado. Conta as conexões por usuário (duas abas, ou o desktop e o
// navegador ao mesmo tempo, são uma pessoa só) e só avisa a mudança quando o
// estado da PESSOA muda: a primeira conexão a deixa online, a última a deixa
// offline.
//
// Ficar offline tem uma carência: recarregar a página ou cair a rede por um
// instante fecha o socket e reabre logo em seguida, e sem carência todo mundo
// veria a pessoa "piscar" pra offline e voltar. Se ela reconecta dentro da
// carência, ninguém é avisado de nada.

export const DEFAULT_OFFLINE_GRACE_MS = 5_000;

type PresenceListener = (userId: string, online: boolean) => void;

export class PresenceTracker {
  private readonly connections = new Map<string, number>();
  private readonly pendingOffline = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly notify: PresenceListener,
    private readonly graceMs: number = DEFAULT_OFFLINE_GRACE_MS,
  ) {}

  connect(userId: string): void {
    const count = (this.connections.get(userId) ?? 0) + 1;
    this.connections.set(userId, count);

    const pending = this.pendingOffline.get(userId);
    if (pending !== undefined) {
      // Voltou dentro da carência: para todo mundo ela nunca saiu.
      clearTimeout(pending);
      this.pendingOffline.delete(userId);
      return;
    }
    if (count === 1) this.notify(userId, true);
  }

  disconnect(userId: string): void {
    const count = this.connections.get(userId) ?? 0;
    if (count <= 0) return;
    if (count > 1) {
      this.connections.set(userId, count - 1);
      return;
    }

    this.connections.delete(userId);
    const timer = setTimeout(() => {
      this.pendingOffline.delete(userId);
      this.notify(userId, false);
    }, this.graceMs);
    // A carência não pode segurar o processo aberto no encerramento.
    timer.unref?.();
    this.pendingOffline.set(userId, timer);
  }

  // Durante a carência a pessoa ainda conta como online, pra bater com o que
  // os outros clientes já sabem (ninguém foi avisado da saída ainda).
  isOnline(userId: string): boolean {
    return this.connections.has(userId) || this.pendingOffline.has(userId);
  }
}
