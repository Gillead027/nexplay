import type { ConnectionSignalInfo } from '../connectionSignal';

// O ícone de sinal do painel do usuário: três barras que acendem conforme a qualidade da conexão com a chamada.
export function ConnectionSignal({ info }: { info: ConnectionSignalInfo }) {
  return (
    <span className={`connection-signal level-${info.level}`} role="img" aria-label={info.label} title={info.label}>
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <rect x="2" y="10" width="3.4" height="6" rx="1" className={info.bars >= 1 ? 'on' : ''} />
        <rect x="7.3" y="6.5" width="3.4" height="9.5" rx="1" className={info.bars >= 2 ? 'on' : ''} />
        <rect x="12.6" y="2" width="3.4" height="14" rx="1" className={info.bars >= 3 ? 'on' : ''} />
      </svg>
    </span>
  );
}
