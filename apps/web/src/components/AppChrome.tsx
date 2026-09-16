import type { ReactNode } from 'react';

export function AppChrome() {
  return (
    <header className="app-chrome">
      <div className="app-chrome-drag" />
      {typeof window !== 'undefined' && window.desktop?.windowAction && (
        <div className="window-controls" aria-label="Controles da janela">
          <button type="button" onClick={() => window.desktop?.windowAction?.('minimize')} aria-label="Minimizar">
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" strokeWidth="1" /></svg>
          </button>
          <button type="button" onClick={() => window.desktop?.windowAction?.('toggle-maximize')} aria-label="Maximizar">
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
          </button>
          <button type="button" className="window-close" onClick={() => window.desktop?.windowAction?.('close')} aria-label="Fechar">
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
