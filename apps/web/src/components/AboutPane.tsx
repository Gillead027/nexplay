import { describeApp, describeBuild, parseDesktopVersion, parseEngineVersion, versionSummary } from '../aboutInfo';
import { copyLabel, useCopyFeedback } from '../useCopyFeedback';

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

// Configurações > Sobre: o que a pessoa está rodando, pra dizer numa conversa de suporte.
// Só mostra o que dá pra saber de verdade: a versão do app vem do user agent do desktop e a
// versão da web é gravada na hora de publicar (apps/web/build-info.json).
export function AboutPane() {
  const { copy, statusFor } = useCopyFeedback();
  const desktop = Boolean(window.desktop);
  const desktopVersion = parseDesktopVersion(navigator.userAgent);
  const engineVersion = parseEngineVersion(navigator.userAgent);
  const build = __BUILD_INFO__;
  const summary = versionSummary({ desktop, desktopVersion, build, engineVersion });

  return (
    <div className="settings-pane about-pane">
      <h2>Sobre</h2>
      <p className="settings-page-description">O que você está usando agora. Copie o resumo e cole ao pedir ajuda.</p>
      <dl className="about-list">
        <div><dt>Aplicativo</dt><dd>{describeApp(desktop, desktopVersion)}</dd></div>
        <div><dt>Versão da web</dt><dd>{describeBuild(build, (iso) => dateTime.format(new Date(iso)))}</dd></div>
        {engineVersion && <div><dt>Motor do navegador</dt><dd>Chromium {engineVersion}</dd></div>}
      </dl>
      <button type="button" className="secondary-pill" onClick={() => void copy('version', summary)}>
        {statusFor('version') === 'idle' ? 'Copiar versão' : copyLabel(statusFor('version'))}
      </button>
    </div>
  );
}
