import { useEffect, useState, type ReactNode } from 'react';
import { native } from '../native';

export function AppChrome() {
  const shell = typeof window !== 'undefined' ? native() : null;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!shell) return undefined;
    // isMaximized/onMaximizedChanged existem só na casca nova; um desktop mais
    // antigo (0.2.19 ou menos) não os tem, então o ícone fica estático em vez
    // de quebrar. Por isso o acesso é feature-detectado.
    const win = shell.window as Partial<{
      isMaximized: () => Promise<boolean>;
      onMaximizedChanged: (listener: (maximized: boolean) => void) => () => void;
    }>;
    if (!win.isMaximized || !win.onMaximizedChanged) return undefined;
    let active = true;
    void win.isMaximized().then((m) => {
      if (active) setMaximized(m);
    });
    const unsubscribe = win.onMaximizedChanged((m) => setMaximized(m));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [shell]);

  return (
    <header className="app-chrome">
      <div className="app-chrome-drag" />
      {shell && (
        <div className="window-controls" aria-label="Controles da janela">
          <button type="button" onClick={() => shell.window.minimize()} aria-label="Minimizar">
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" strokeWidth="1" /></svg>
          </button>
          <button
            type="button"
            onClick={() => shell.window.toggleMaximize()}
            aria-label={maximized ? 'Restaurar' : 'Maximizar'}
          >
            {maximized ? (
              <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
                <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
                <path d="M2.5 2.5V0.5H9.5V7.5H7.5" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
            )}
          </button>
          <button type="button" className="window-close" onClick={() => shell.window.close()} aria-label="Fechar">
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" /></svg>
          </button>
        </div>
      )}
    </header>
  );
}

export function AppFrame({ children }: { children: ReactNode }) {
  return <div className="app-frame"><AppChrome />{children}</div>;
}
