import { useEffect } from 'react';
import type { AccentColor, AvatarFrame } from '@nexplay/shared';
import { startRingtone } from '../sounds';
import { PhoneIcon, PhoneOffIcon } from './Icons';
import { Avatar } from './Workspace';

// Ligação individual chegando: aviso no canto da tela com o toque, e os botões de atender e recusar. O toque só soa com o volume
// escolhido em Aparência e fica mudo em "Não perturbe" (o aviso na tela continua). Some sozinho quando quem ligou desiste ou a
// ligação é atendida em outro lugar, porque quem manda nele é o estado das ligações.
export function IncomingDmCall({
  callerName,
  accentColor,
  avatarUrl,
  avatarFrame,
  alreadyInCall,
  ringVolume,
  busy,
  onAccept,
  onDecline,
}: {
  callerName: string;
  accentColor: AccentColor;
  avatarUrl: string;
  avatarFrame: AvatarFrame | '';
  // A pessoa já está numa chamada de voz: atender troca de chamada.
  alreadyInCall: boolean;
  ringVolume: () => number;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  useEffect(() => startRingtone(ringVolume), [ringVolume]);

  return (
    <div className="incoming-call" role="alertdialog" aria-label={`${callerName} está te ligando`}>
      <div className="incoming-call-identity">
        <span className="incoming-call-avatar"><Avatar name={callerName} accentColor={accentColor} avatarUrl={avatarUrl} frame={avatarFrame} /></span>
        <div>
          <strong>{callerName}</strong>
          <span>está te ligando…</span>
        </div>
      </div>
      {alreadyInCall && <p className="incoming-call-hint">Atender sai da chamada de voz em que você está.</p>}
      <div className="incoming-call-actions">
        <button type="button" className="incoming-call-decline" onClick={onDecline} disabled={busy} aria-label="Recusar ligação" title="Recusar">
          <PhoneOffIcon size={18} /> Recusar
        </button>
        <button type="button" className="incoming-call-accept" onClick={onAccept} disabled={busy} aria-label="Atender ligação" title="Atender" autoFocus>
          <PhoneIcon size={18} /> Atender
        </button>
      </div>
    </div>
  );
}
