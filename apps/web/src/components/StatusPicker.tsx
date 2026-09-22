import { type ReactNode, useEffect, useRef, useState } from 'react';
import { PRESENCE_STATUSES, PRESENCE_STATUS_HINTS, PRESENCE_STATUS_LABELS, type PresenceStatus } from '@nexplay/shared';
import { useEscapeLayer } from '../escapeLayers';

/**
 * A área do usuário no rodapé da barra lateral: clicar nela abre a escolha do que mostrar aos outros (Online, Ausente,
 * Não perturbe ou Invisível), como no Discord. O conteúdo (foto e nome) vem de fora.
 */
export function StatusPicker({
  status,
  onSelect,
  children,
}: {
  status: PresenceStatus;
  onSelect: (status: PresenceStatus) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEscapeLayer(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div className="status-picker" ref={containerRef}>
      <button
        type="button"
        className="status-picker-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Alterar o seu status"
      >
        {children}
      </button>
      {open && (
        <div className="status-picker-menu" role="menu" aria-label="Seu status">
          {PRESENCE_STATUSES.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={option === status}
              className={option === status ? 'active' : ''}
              onClick={() => {
                setOpen(false);
                if (option !== status) onSelect(option);
              }}
            >
              <i className={`status-dot status-${option}`} aria-hidden="true" />
              <span>
                <strong>{PRESENCE_STATUS_LABELS[option]}</strong>
                <small>{PRESENCE_STATUS_HINTS[option]}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
