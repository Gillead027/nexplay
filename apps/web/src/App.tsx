import { lazy, Suspense, useEffect, useState } from 'react';
import type { PublicConfig, UserSession } from '@nexplay/shared';
import { api } from './api';
import { disconnectRealtime } from './realtime';
import { onSessionExpired } from './sessionExpiry';
import { EntryScreen } from './components/EntryScreen';
import { AppFrame } from './components/AppChrome';

const Workspace = lazy(() =>
  import('./components/Workspace').then((module) => ({ default: module.Workspace })),
);

type BootState =
  | { status: 'loading' }
  | { status: 'signed-out'; notice?: string }
  | { status: 'ready'; session: UserSession; config: PublicConfig }
  | { status: 'error'; message: string };

function LoadingWindow({ label }: { label: string }) {
  return (
    <main className="splash" aria-live="polite">
      <div className="boot-window">
        <div className="boot-title">NexPlay</div>
        <div className="skeleton-line wide" />
        <div className="skeleton-line" />
        <span>{label}</span>
      </div>
    </main>
  );
}

export function App() {
  const [state, setState] = useState<BootState>({ status: 'loading' });

  async function loadAuthenticatedApp(session: UserSession) {
    try {
      const config = await api.getConfig();
      setState({ status: 'ready', session, config });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível carregar o aplicativo.',
      });
    }
  }

  useEffect(() => {
    let active = true;
    api
      .getSession()
      .then(({ user }) => {
        if (active) void loadAuthenticatedApp(user);
      })
      .catch(() => {
        if (active) setState({ status: 'signed-out' });
      });
    return () => {
      active = false;
    };
  }, []);

  // Sessão recusada pelo servidor com o app já aberto (cookie vencido ou senha
  // trocada em outro aparelho — o login normal dura 1 ano):
  // volta pra tela de entrada dizendo por quê, em vez de deixar a tela parecendo
  // logada com o tempo real morto. Só age em 'ready' — durante o boot ou já
  // deslogado, um 401 é esperado e o fluxo normal cuida dele. Sair do Workspace
  // desmonta a chamada de voz junto.
  useEffect(() => {
    return onSessionExpired(() => {
      disconnectRealtime();
      setState((current) =>
        current.status === 'ready'
          ? { status: 'signed-out', notice: 'Sua sessão expirou. Entre novamente para continuar.' }
          : current,
      );
    });
  }, []);

  if (state.status === 'loading') return <AppFrame><LoadingWindow label="Carregando usuário…" /></AppFrame>;
  if (state.status === 'signed-out') return <AppFrame><EntryScreen onAuthenticated={loadAuthenticatedApp} notice={state.notice} /></AppFrame>;

  if (state.status === 'error') {
    return (
      <AppFrame><main className="splash error-page">
        <h1>Não foi possível iniciar</h1>
        <p>{state.message}</p>
        <button className="primary-button" onClick={() => window.location.reload()}>
          Tentar novamente
        </button>
      </main></AppFrame>
    );
  }

  return (
    <AppFrame><Suspense fallback={<LoadingWindow label="Carregando interface…" />}>
      <Workspace
        session={state.session}
        config={state.config}
        onSignOut={async () => {
          await api.deleteSession().catch(() => undefined);
          disconnectRealtime();
          setState({ status: 'signed-out' });
        }}
        onProfileUpdated={(session) =>
          setState((current) => (current.status === 'ready' ? { ...current, session } : current))
        }
      />
    </Suspense></AppFrame>
  );
}
