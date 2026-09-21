import { useState } from 'react';
import { describeApp, describeBuild, parseDesktopVersion, parseEngineVersion, versionSummary } from '../aboutInfo';
import licenses from '../licenses.json';
import { PRIVACY_POLICY, TERMS_OF_USE, type LegalDocument } from '../legalTexts';
import { copyLabel, useCopyFeedback } from '../useCopyFeedback';
import { UpdateCheck } from './UpdateCheck';

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

type Reading = 'privacy' | 'terms' | 'licenses' | null;

function LegalText({ document }: { document: LegalDocument }) {
  return (
    <article className="about-reading" aria-label={document.title}>
      <h3>{document.title}</h3>
      <p className="about-reading-date">Atualizado em {document.updatedAt}</p>
      <p>{document.intro}</p>
      {document.sections.map((section) => (
        <section key={section.heading}>
          <h4>{section.heading}</h4>
          {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </section>
      ))}
    </article>
  );
}

function LicenseList() {
  return (
    <article className="about-reading" aria-label="Licenças de código aberto">
      <h3>Licenças de código aberto</h3>
      <p>
        O app web usa {licenses.length} pacotes de terceiros. O texto completo de cada licença acompanha o pacote no
        endereço indicado; o NexPlay não muda nenhum deles.
      </p>
      <ul className="about-licenses">
        {licenses.map((item) => (
          <li key={`${item.name}@${item.version}`}>
            <strong>{item.name}</strong> <span>{item.version}</span>
            <em>{item.license}</em>
            {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer">{item.url.replace(/^https?:\/\//, '')}</a>}
          </li>
        ))}
      </ul>
    </article>
  );
}

// Configurações > Sobre: o que a pessoa está rodando (pra dizer numa conversa de suporte), a
// verificação de atualização e os textos legais. Só mostra o que dá pra saber de verdade: a
// versão do app vem do user agent do desktop e a versão da web é gravada na hora de publicar
// (apps/web/build-info.json).
export function AboutPane() {
  const { copy, statusFor } = useCopyFeedback();
  const [reading, setReading] = useState<Reading>(null);
  const desktop = Boolean(window.desktop);
  const desktopVersion = parseDesktopVersion(navigator.userAgent);
  const engineVersion = parseEngineVersion(navigator.userAgent);
  const build = __BUILD_INFO__;
  const summary = versionSummary({ desktop, desktopVersion, build, engineVersion });
  const toggle = (next: Exclude<Reading, null>) => setReading((current) => (current === next ? null : next));

  return (
    <div className="settings-pane about-pane">
      <h2>Sobre</h2>
      <p className="settings-page-description">O que você está usando agora. Copie o resumo e cole ao pedir ajuda.</p>
      <dl className="about-list">
        <div><dt>Aplicativo</dt><dd>{describeApp(desktop, desktopVersion)}</dd></div>
        <div><dt>Versão da web</dt><dd>{describeBuild(build, (iso) => dateTime.format(new Date(iso)))}</dd></div>
        {engineVersion && <div><dt>Motor do navegador</dt><dd>Chromium {engineVersion}</dd></div>}
      </dl>
      <div className="about-actions">
        <button type="button" className="secondary-pill" onClick={() => void copy('version', summary)}>
          {statusFor('version') === 'idle' ? 'Copiar versão' : copyLabel(statusFor('version'))}
        </button>
        <UpdateCheck />
        {desktop && window.desktop?.openLogs && (
          <button type="button" className="secondary-pill" onClick={() => void window.desktop?.openLogs?.()}>Abrir pasta de logs</button>
        )}
      </div>
      <div className="about-actions about-legal-buttons" role="group" aria-label="Documentos">
        <button type="button" className={`secondary-pill ${reading === 'privacy' ? 'active' : ''}`} aria-pressed={reading === 'privacy'} onClick={() => toggle('privacy')}>
          Política de privacidade
        </button>
        <button type="button" className={`secondary-pill ${reading === 'terms' ? 'active' : ''}`} aria-pressed={reading === 'terms'} onClick={() => toggle('terms')}>
          Termos de uso
        </button>
        <button type="button" className={`secondary-pill ${reading === 'licenses' ? 'active' : ''}`} aria-pressed={reading === 'licenses'} onClick={() => toggle('licenses')}>
          Licenças de código aberto
        </button>
      </div>
      {reading === 'privacy' && <LegalText document={PRIVACY_POLICY} />}
      {reading === 'terms' && <LegalText document={TERMS_OF_USE} />}
      {reading === 'licenses' && <LicenseList />}
    </div>
  );
}
