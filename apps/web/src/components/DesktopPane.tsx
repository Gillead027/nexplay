import { useEffect, useState } from 'react';

export interface DesktopSettingsView {
  closeToTray: boolean;
  launchAtLogin: boolean;
  startMinimized: boolean;
  // Atalhos globais (formato Accelerator do Electron); '' = desativado. Funcionam mesmo com o
  // NexPlay em segundo plano — ver globalShortcut em apps/desktop/src/main.ts.
  globalMuteHotkey: string;
  globalDeafenHotkey: string;
  // false quando configurado mas outro programa já registrou a mesma combinação.
  globalMuteHotkeyActive: boolean;
  globalDeafenHotkeyActive: boolean;
  // O Windows só deixa registrar "iniciar com o Windows" no app instalado (não na versão portátil).
  launchAtLoginAvailable: boolean;
  trayAvailable: boolean;
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph']);

// ' '/setas/Enter etc. têm nomes diferentes no evento do navegador e no Accelerator do Electron;
// o resto (letras, dígitos, pontuação de um caractere só) usa o próprio event.key.
const SPECIAL_KEY_NAMES: Record<string, string> = {
  ' ': 'Space', Escape: 'Escape', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Enter: 'Return', Delete: 'Delete', Backspace: 'Backspace', Insert: 'Insert', Home: 'Home', End: 'End',
  PageUp: 'PageUp', PageDown: 'PageDown', Tab: 'Tab', PrintScreen: 'PrintScreen',
  AudioVolumeUp: 'VolumeUp', AudioVolumeDown: 'VolumeDown', AudioVolumeMute: 'VolumeMute',
  MediaTrackNext: 'MediaNextTrack', MediaTrackPrevious: 'MediaPreviousTrack', MediaStop: 'MediaStop', MediaPlayPause: 'MediaPlayPause',
};

// Converte o keydown capturado pro formato Accelerator do Electron (globalShortcut.register) —
// não é o mesmo formato de event.code usado pela tecla de push-to-talk (essa é só um listener
// em página, sem esse formato). Devolve null quando não dá pra formar um atalho válido (só
// modificador sozinho, ou tecla sem equivalente conhecido no Electron).
function keyboardEventToAccelerator(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Control');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Super');
  let key = SPECIAL_KEY_NAMES[event.key];
  if (!key) {
    if (/^F[1-9][0-9]?$/.test(event.key)) key = event.key;
    else if (event.key.length === 1) key = event.key.toUpperCase();
    else return null;
  }
  parts.push(key);
  return parts.join('+');
}

function HotkeyRow({
  label, hint, value, active, onChange,
}: {
  label: string;
  hint: string;
  value: string;
  active: boolean;
  onChange: (accelerator: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const [captureError, setCaptureError] = useState('');

  useEffect(() => {
    if (!listening) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setListening(false);
        return;
      }
      const accelerator = keyboardEventToAccelerator(event);
      if (!accelerator) {
        setCaptureError('Essa tecla não pode virar atalho global — tente outra combinação.');
        return;
      }
      setCaptureError('');
      onChange(accelerator);
      setListening(false);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [listening, onChange]);

  return (
    <div className="settings-toggle-row voice-processing-toggle">
      <div>
        <span className="settings-label">{label}</span>
        <p className="settings-hint">{hint}</p>
        {value && !active && <p className="form-error">Não está ativo — outro programa já usa "{value}".</p>}
        {captureError && <p className="form-error" role="alert">{captureError}</p>}
      </div>
      <div className="hotkey-row-controls">
        <button type="button" className="ptt-key-button" onClick={() => { setCaptureError(''); setListening(true); }}>
          {listening ? 'Pressione uma tecla…' : value || 'Nenhum'}
        </button>
        {value && !listening && (
          <button type="button" className="test-toggle-button" onClick={() => onChange('')}>Limpar</button>
        )}
      </div>
    </div>
  );
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

  async function change(
    patch: Partial<Pick<DesktopSettingsView, 'closeToTray' | 'launchAtLogin' | 'startMinimized' | 'globalMuteHotkey' | 'globalDeafenHotkey'>>,
  ) {
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
            <h3 className="admin-heading">Atalhos globais</h3>
            <p className="settings-page-description">Funcionam mesmo com o NexPlay em segundo plano, como jogando.</p>
            <HotkeyRow
              label="Mutar/desmutar microfone"
              hint="Pressione uma tecla ou combinação pra gravar."
              value={settings.globalMuteHotkey}
              active={settings.globalMuteHotkeyActive}
              onChange={(globalMuteHotkey) => void change({ globalMuteHotkey })}
            />
            <HotkeyRow
              label="Ensurdecer/reativar áudio"
              hint="Pressione uma tecla ou combinação pra gravar."
              value={settings.globalDeafenHotkey}
              active={settings.globalDeafenHotkeyActive}
              onChange={(globalDeafenHotkey) => void change({ globalDeafenHotkey })}
            />
          </>
        )}
      </div>
    </div>
  );
}
