import { useEffect, useMemo, useState } from 'react';
import { EMOJI_DATA, EMOJI_GROUPS, type EmojiDatasetEntry } from '@nexplay/shared';
import { SearchIcon } from './Icons';

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const ENTRIES_BY_GROUP = new Map<string, EmojiDatasetEntry[]>(
  EMOJI_GROUPS.map((group) => [group, EMOJI_DATA.filter((entry) => entry.group === group)]),
);

const PICKER_WIDTH = 260;
const PICKER_HEIGHT = 300;
const PICKER_MARGIN = 8;

// Mesma ideia de ProfilePopover.tsx (clampPosition): position:fixed com
// coordenadas calculadas a partir do retângulo do botão que abriu o picker,
// pra não ficar cortado pelo overflow:auto da lista de mensagens (um
// position:absolute comum seria clipado ali, já que o picker é bem mais alto
// que o antigo ReactionPicker de 8 emojis).
function clampPosition(rect: DOMRect): { top: number; left: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let left = rect.right - PICKER_WIDTH;
  left = Math.min(Math.max(left, PICKER_MARGIN), viewportWidth - PICKER_WIDTH - PICKER_MARGIN);
  let top = rect.bottom + 4;
  if (top + PICKER_HEIGHT > viewportHeight) {
    top = Math.max(PICKER_MARGIN, rect.top - PICKER_HEIGHT - 4);
  }
  return { top, left };
}

export function EmojiPicker({
  anchorRect,
  onSelect,
  onClose,
}: {
  anchorRect: DOMRect;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState(EMOJI_GROUPS[0]!);

  useEffect(() => {
    const handlePointerDown = () => onClose();
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [onClose]);

  const normalizedQuery = normalize(query.trim());
  const visibleEntries = useMemo(() => {
    if (!normalizedQuery) return ENTRIES_BY_GROUP.get(activeGroup) ?? [];
    return EMOJI_DATA.filter((entry) => normalize(entry.name).includes(normalizedQuery));
  }, [normalizedQuery, activeGroup]);

  const { top, left } = clampPosition(anchorRect);

  return (
    <div
      className="emoji-picker"
      style={{ top: `${top}px`, left: `${left}px` }}
      onMouseDown={(event) => event.stopPropagation()}
      role="menu"
      aria-label="Escolher emoji"
    >
      <div className="emoji-picker-search">
        <SearchIcon size={13} />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar emoji (em inglês)…"
          autoFocus
        />
      </div>
      {!normalizedQuery && (
        <div className="emoji-picker-tabs" role="tablist" aria-label="Categorias de emoji">
          {EMOJI_GROUPS.map((group) => (
            <button
              key={group}
              type="button"
              role="tab"
              aria-selected={group === activeGroup}
              className={group === activeGroup ? 'active' : ''}
              title={group}
              onClick={() => setActiveGroup(group)}
            >
              {ENTRIES_BY_GROUP.get(group)?.[0]?.emoji}
            </button>
          ))}
        </div>
      )}
      <div className="emoji-picker-grid" role="listbox" aria-label={normalizedQuery ? 'Resultados da busca' : activeGroup}>
        {visibleEntries.length === 0 && <div className="emoji-picker-empty">Nenhum emoji encontrado.</div>}
        {visibleEntries.map((entry) => (
          <button key={entry.slug} type="button" role="option" title={entry.name} onClick={() => onSelect(entry.emoji)}>
            {entry.emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
