import { useEffect, useState } from 'react';

export interface DesktopSettingsView {
  closeToTray: boolean;
  launchAtLogin: boolean;
  startMinimized: boolean;
  // O Windows só deixa registrar "iniciar com o Windows" no app instalado (não na versão portátil).
  launchAtLoginAvailable: boolean;
  trayAvailable: boolean;
}

function Row({ label, hint, checked, disabled = false, onChange }: { label: string; hint: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className={`settings-toggle-row voice-processing-toggle ${disabled ? 'is-disabled' : ''}`}>
      <div>
        <span className="settings-label">{label}</span>
        <p className="settings-hint">{hint}</p>
      </div>
      <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} className={`settings-switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} />
    </div>
  );
}

/** Configurações > Aplicativo (só no app de desktop): bandeja do sistema e início com o Windows. */
export function DesktopPane() {
  const [settings, setSettings] = useState<DesktopSettingsView | null>(null);

  useEffect(() => {
    let active = true;
    void window.desktop?.getDesktopSettings?.().then((loaded) => {
      if (active) setSettings(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  async function change(patch: Partial<Pick<DesktopSettingsView, 'closeToTray' | 'launchAtLogin' | 'startMinimized'>>) {
    if (!settings) return;
    setSettings({ ...settings, ...patch });
    const applied = await window.desktop?.setDesktopSettings?.(patch);
    if (applied) setSettings(applied);
  }

  return (
    <div className="settings-pane">
      <div className="settings-pane-main">
        <h2>Aplicativo</h2>
        <p className="settings-page-description">Como o NexPlay se comporta no seu computador.</p>
        {!settings ? (
          <p className="settings-hint">Carregando…</p>
        ) : (
          <>
            <Row
              label="Fechar minimiza para a bandeja"
              hint={
                settings.trayAvailable
                  ? 'Ao clicar no X o NexPlay continua rodando em segundo plano (a call e as notificações seguem ativas). Para sair de vez, use "Sair do NexPlay" no ícone da bandeja.'
                  : 'A bandeja do sistema não está disponível neste computador, então o X fecha o aplicativo.'
              }
              checked={settings.closeToTray && settings.trayAvailable}
              disabled={!settings.trayAvailable}
              onChange={(closeToTray) => void change({ closeToTray })}
            />
            <Row
              label="Iniciar o NexPlay com o Windows"
              hint={
                settings.launchAtLoginAvailable
                  ? 'Abre o aplicativo sozinho quando você entra no Windows.'
                  : 'Disponível só no aplicativo instalado (a versão portátil não pode se registrar no início do Windows).'
              }
              checked={settings.launchAtLogin}
              disabled={!settings.launchAtLoginAvailable}
              onChange={(launchAtLogin) => void change({ launchAtLogin })}
            />
            <Row
              label="Iniciar minimizado"
              hint="Quando abrir sozinho com o Windows, fica na bandeja em vez de abrir a janela."
              checked={settings.startMinimized}
              disabled={!settings.launchAtLoginAvailable || !settings.launchAtLogin || !settings.trayAvailable}
              onChange={(startMinimized) => void change({ startMinimized })}
            />
          </>
        )}
      </div>
    </div>
  );
}
