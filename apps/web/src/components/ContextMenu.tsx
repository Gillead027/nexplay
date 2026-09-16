import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface ContextMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
}

export interface ContextMenuSection {
  items: ContextMenuItem[];
}

interface ContextMenuState {
  x: number;
  y: number;
  sections: ContextMenuSection[];
}

// Menu de clique direito genérico — posiciona no ponto do clique e se
// desloca pra dentro da viewport se estourar a borda. Reaproveitado por
// categorias hoje; qualquer outro alvo (canal, mensagem) pode usar o mesmo
// hook sem duplicar a lógica de posicionamento/fechamento.
export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState | null>(null);

  function open(event: { preventDefault: () => void; clientX: number; clientY: number }, sections: ContextMenuSection[]) {
    event.preventDefault();
    setState({ x: event.clientX, y: event.clientY, sections });
  }

  function close() {
    setState(null);
  }

  return { state, open, close };
}

export function ContextMenu({ state, onClose }: { state: ContextMenuState | null; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!state) {
      setPosition(null);
      return;
    }
    const menu = menuRef.current;
    if (!menu) {
      setPosition({ x: state.x, y: state.y });
      return;
    }
    const { innerWidth, innerHeight } = window;
    const rect = menu.getBoundingClientRect();
    const x = Math.min(state.x, innerWidth - rect.width - 8);
    const y = Math.min(state.y, innerHeight - rect.height - 8);
    setPosition({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [state]);

  useEffect(() => {
    if (!state) return;
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [state, onClose]);

  if (!state) return null;
  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      style={{ left: (position ?? state).x, top: (position ?? state).y, visibility: position ? 'visible' : 'hidden' }}
    >
      {state.sections.map((section, index) => (
        <div className="context-menu-section" key={index}>
          {index > 0 && <div className="context-menu-divider" />}
          {section.items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`context-menu-item ${item.danger ? 'danger' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                onClose();
              }}
            >
              <span>{item.label}</span>
              {item.checked && <span className="context-menu-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
