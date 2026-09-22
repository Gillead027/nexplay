import { useState } from 'react';
import { getOutputVolume } from '../appearancePrefs';
import { getNotificationPrefs, setNotificationPrefs } from '../notificationPrefs';
import { playMentionSound, playMessageSound } from '../sounds';

function Row({ label, hint, checked, onChange, onTest }: { label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void; onTest: () => void }) {
  return (
    <div className="settings-toggle-row voice-processing-toggle">
      <div>
        <span className="settings-label">{label}</span>
        <p className="settings-hint">{hint}</p>
        <button type="button" className="test-toggle-button" onClick={onTest}>Ouvir o som</button>
      </div>
      <button type="button" role="switch" aria-label={label} aria-checked={checked} className={`settings-switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} />
    </div>
  );
}

/** Configurações > Notificações: os sons de mensagem nova e de menção (guardados neste dispositivo). */
export function NotificationsPane() {
  const [prefs, setPrefs] = useState(getNotificationPrefs);

  function change(patch: Partial<typeof prefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setNotificationPrefs(next);
  }

  return (
    <div className="settings-pane">
      <div className="settings-pane-main">
        <h2>Notificações</h2>
        <p className="settings-page-description">Escolha quando o NexPlay toca um som para avisar de mensagens. O volume é o mesmo de "Volume de saída", em Voz e vídeo.</p>
        <Row
          label="Som de mensagem nova"
          hint="Toca quando chega uma mensagem num canal ou conversa que você não está olhando. Cada canal ainda pode ficar mudo ou só com menções pelo menu da categoria."
          checked={prefs.messages}
          onChange={(messages) => change({ messages })}
          onTest={() => playMessageSound(getOutputVolume())}
        />
        <Row
          label="Som de menção"
          hint="Toca, com um som diferente, quando alguém escreve @seu nome. Vale mesmo nos canais em que você só quer ser avisado das menções."
          checked={prefs.mentions}
          onChange={(mentions) => change({ mentions })}
          onTest={() => playMentionSound(getOutputVolume())}
        />
        <p className="settings-hint">
          No status "Não perturbe" nenhum som de aviso toca. Sem som também quando você está olhando o canal com o app em foco, e mensagens do bot de música e do NexDex nunca tocam.
        </p>
      </div>
    </div>
  );
}
