import { useState } from 'react';
import { describeUpdate } from '../aboutInfo';

// "Verificar atualizações" do app desktop. Só existe quando o app instalado tem a função
// (desktop 0.2.12 em diante); no navegador e em versões antigas o botão não aparece.
export function UpdateCheck() {
  const check = window.desktop?.checkForUpdates;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!check) return null;

  async function run() {
    setBusy(true);
    setMessage('');
    try {
      setMessage(describeUpdate(await check!()));
    } catch {
      setMessage('Não foi possível verificar agora. Tente de novo em instantes.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="secondary-pill" onClick={() => void run()} disabled={busy}>
        {busy ? 'Verificando…' : 'Verificar atualizações'}
      </button>
      {message && <span className="about-update-status" role="status">{message}</span>}
    </>
  );
}
