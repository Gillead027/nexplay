import { useEffect } from 'react';
import { activityIdentity, publicActivity, type Activity } from '@nexplay/shared';
import { api } from './api';
import { onRealtimeConnect } from './realtime';

// Conta pro servidor o que a pessoa está jogando ou ouvindo (detectado pelo app desktop) para aparecer na lista de membros
// de todos os servidores dela, como no Discord. Só o essencial vai: o jogo, ou a faixa e o artista (sem capa nem tempo, que
// mudam o tempo todo). Envia quando a atividade muda e de novo a cada (re)conexão do tempo real, porque o servidor esquece
// tudo quando a pessoa sai ou ele reinicia. No navegador não há detecção, então não faz nada.
export function useShareActivity(): void {
  useEffect(() => {
    const desktop = window.desktop;
    if (!desktop?.onActivityChanged) return;

    let latest: Activity | null = null;
    let sentIdentity: string | null = null;

    const publish = (force: boolean) => {
      const shared = latest && publicActivity(latest);
      const identity = activityIdentity(shared);
      if (!force && identity === sentIdentity) return;
      sentIdentity = identity;
      // Falha de rede não pode incomodar ninguém: na próxima mudança ou reconexão ele tenta de novo.
      api.setActivity(shared).catch(() => {
        sentIdentity = null;
      });
    };

    const apply = (activity: Activity | null) => {
      latest = activity;
      publish(false);
    };

    // A primeira detecção pode ter acontecido antes deste efeito montar (Spotify já tocando antes de abrir a janela).
    void desktop.getCurrentActivity?.().then((activity) => apply(activity ?? null));
    const unsubscribeActivity = desktop.onActivityChanged(apply);
    const unsubscribeConnect = onRealtimeConnect(() => publish(true));

    return () => {
      unsubscribeActivity?.();
      unsubscribeConnect();
    };
  }, []);
}
