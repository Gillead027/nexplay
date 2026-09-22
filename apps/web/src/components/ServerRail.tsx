import { type DragEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { SERVER_FOLDER_COLORS, SERVER_FOLDER_NAME_MAX_LENGTH, type Server } from '@nexplay/shared';
import { useEscapeLayer } from '../escapeLayers';
import {
  createFolderWith,
  dropServer,
  editFolder,
  moveServerToFolder,
  removeFromFolder,
  ungroupFolder,
  type DropMode,
  type DropTarget,
  type FolderItem,
  type RailItem,
} from '../serverFolders';
import { useServerLayout } from '../useServerLayout';
import { ContextMenu, useContextMenu, type ContextMenuSection } from './ContextMenu';
import { ServerImage } from './ServerImage';

const OPEN_FOLDERS_KEY = 'np:open-folders';

function loadOpenFolders(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(OPEN_FOLDERS_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

type RailServer = Pick<Server, 'id' | 'name' | 'iconUrl' | 'iconAnimated'>;

function ServerRailButton({
  server,
  active,
  inFolder = false,
  onSelect,
  dragHandlers,
}: {
  server: RailServer;
  active: boolean;
  inFolder?: boolean;
  onSelect: () => void;
  dragHandlers: { draggable: true; onDragStart: (event: DragEvent) => void; onDragEnd: () => void };
}) {
  const [hovered, setHovered] = useState(false);
  const hasIcon = Boolean(server.iconUrl);
  return (
    <button
      className={`server-button server-current ${hasIcon ? 'has-icon' : ''} ${active ? 'active' : ''} ${inFolder ? 'in-folder' : ''}`}
      type="button"
      title={server.name}
      aria-label={server.name}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      {...dragHandlers}
    >
      {hasIcon ? <ServerImage src={server.iconUrl} animated={server.iconAnimated} hovered={hovered} /> : server.name.charAt(0).toUpperCase()}
    </button>
  );
}

// Nome, cor e desfazer uma pasta.
function FolderDialog({
  folder,
  onSave,
  onUngroup,
  onClose,
}: {
  folder: FolderItem;
  onSave: (patch: { name: string; color: string }) => void;
  onUngroup: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(folder.name);
  const [color, setColor] = useState(folder.color);
  useEscapeLayer(true, onClose);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({ name, color });
    onClose();
  }

  return (
    <div className="rail-dialog-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="rail-dialog" role="dialog" aria-modal="true" aria-label="Editar pasta" onSubmit={submit}>
        <h3>Editar pasta</h3>
        <label htmlFor="folder-name">Nome da pasta</label>
        <input id="folder-name" ref={inputRef} value={name} maxLength={SERVER_FOLDER_NAME_MAX_LENGTH} placeholder="Pasta sem nome" onChange={(event) => setName(event.target.value)} />
        <span className="rail-dialog-label">Cor</span>
        <div className="rail-color-swatches" role="radiogroup" aria-label="Cor da pasta">
          {SERVER_FOLDER_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              role="radio"
              aria-checked={swatch === color}
              aria-label={`Cor ${swatch}`}
              className={swatch === color ? 'selected' : ''}
              style={{ background: swatch }}
              onClick={() => setColor(swatch)}
            />
          ))}
        </div>
        <div className="rail-dialog-actions">
          <button type="button" className="danger-text" onClick={() => { onUngroup(); onClose(); }}>Desfazer pasta</button>
          <span />
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary">Salvar</button>
        </div>
      </form>
    </div>
  );
}

interface DropState {
  key: string;
  mode: DropMode;
}

/**
 * A lista de servidores da barra lateral, com pastas como no Discord: arraste um servidor sobre outro para criar uma pasta, sobre
 * uma pasta para colocar dentro, ou entre os itens para reordenar. O clique direito faz o mesmo sem arrastar (e é o caminho pelo
 * teclado). A organização é de cada pessoa, guardada no servidor e igual em todos os aparelhos.
 */
export function ServerRail({
  servers,
  activeServerId,
  serverViewActive,
  onSelectServer,
}: {
  servers: readonly Server[];
  activeServerId: string | null;
  serverViewActive: boolean;
  onSelectServer: (serverId: string) => void;
}) {
  const { layout, rail, serverIds, update } = useServerLayout(servers);
  const [openFolders, setOpenFolders] = useState<Set<string>>(loadOpenFolders);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropState | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const menu = useContextMenu();

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_FOLDERS_KEY, JSON.stringify([...openFolders]));
    } catch {
      // sem armazenamento: as pastas abertas voltam ao padrão na próxima vez
    }
  }, [openFolders]);

  const folders = useMemo(() => rail.filter((item): item is Extract<RailItem, { type: 'folder' }> => item.type === 'folder'), [rail]);
  const editingFolder = folders.find((item) => item.folder.id === editingFolderId)?.folder ?? null;

  const toggleFolder = (folderId: string) =>
    setOpenFolders((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });

  const dragHandlers = (serverId: string) => ({
    draggable: true as const,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', serverId);
      setDraggedId(serverId);
    },
    onDragEnd: () => {
      setDraggedId(null);
      setDrop(null);
    },
  });

  // Onde o servidor arrastado cairia: pelo pedaço do item em que o mouse está (de cima: antes; do meio: dentro; de baixo: depois).
  const dropHandlers = (key: string, target: DropTarget, allowInto: boolean) => ({
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (!draggedId) return;
      if (target.kind === 'server' && target.id === draggedId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = (event.clientY - rect.top) / Math.max(1, rect.height);
      const mode: DropMode = allowInto && ratio > 0.28 && ratio < 0.72 ? 'into' : ratio < 0.5 ? 'before' : 'after';
      setDrop((current) => (current?.key === key && current.mode === mode ? current : { key, mode }));
    },
    onDragLeave: (event: DragEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop((current) => (current?.key === key ? null : current));
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const dragged = draggedId ?? event.dataTransfer.getData('text/plain');
      const mode = drop?.key === key ? drop.mode : 'after';
      setDraggedId(null);
      setDrop(null);
      if (dragged) update(dropServer(layout, serverIds, dragged, target, mode));
    },
  });

  const slotClass = (key: string) => `rail-slot ${drop?.key === key ? `drop-${drop.mode}` : ''} ${draggedId ? 'dragging-any' : ''}`;

  function serverMenu(server: RailServer, insideFolderId: string | null): ContextMenuSection[] {
    const sections: ContextMenuSection[] = [];
    const items = [];
    if (insideFolderId) {
      items.push({ key: 'out', label: 'Tirar da pasta', onSelect: () => update(removeFromFolder(layout, serverIds, server.id)) });
    }
    items.push({ key: 'new', label: 'Criar pasta com este servidor', onSelect: () => update(createFolderWith(layout, serverIds, server.id)) });
    sections.push({ items });
    const others = folders.filter((item) => item.folder.id !== insideFolderId);
    if (others.length > 0) {
      sections.push({
        items: others.map((item) => ({
          key: `to-${item.folder.id}`,
          label: `Mover para ${item.folder.name || 'pasta sem nome'}`,
          onSelect: () => update(moveServerToFolder(layout, serverIds, server.id, item.folder.id)),
        })),
      });
    }
    return sections;
  }

  const renderServer = (server: Server, key: string, insideFolderId: string | null) => (
    <div
      key={key}
      className={slotClass(key)}
      onContextMenu={(event) => menu.open(event, serverMenu(server, insideFolderId))}
      {...dropHandlers(key, { kind: 'server', id: server.id }, insideFolderId === null)}
    >
      <ServerRailButton
        server={server}
        active={serverViewActive && activeServerId === server.id}
        inFolder={insideFolderId !== null}
        onSelect={() => onSelectServer(server.id)}
        dragHandlers={dragHandlers(server.id)}
      />
    </div>
  );

  return (
    <>
      {rail.map((item) => {
        if (item.type === 'server') return renderServer(item.server, item.key, null);
        const open = openFolders.has(item.folder.id);
        const containsActive = serverViewActive && item.servers.some((server) => server.id === activeServerId);
        const title = item.folder.name || 'Pasta sem nome';
        return (
          <div key={item.key} className={`rail-folder ${open ? 'open' : ''}`} style={{ ['--folder-color' as string]: item.folder.color }}>
            <div
              className={slotClass(item.key)}
              onContextMenu={(event) =>
                menu.open(event, [
                  {
                    items: [
                      { key: 'edit', label: 'Editar pasta', onSelect: () => setEditingFolderId(item.folder.id) },
                      { key: 'ungroup', label: 'Desfazer pasta', danger: true, onSelect: () => update(ungroupFolder(layout, serverIds, item.folder.id)) },
                    ],
                  },
                ])
              }
              {...dropHandlers(item.key, { kind: 'folder', id: item.folder.id }, true)}
            >
              <button
                type="button"
                className={`server-button rail-folder-button ${containsActive && !open ? 'active' : ''}`}
                title={`${title} — ${item.servers.length} servidor${item.servers.length === 1 ? '' : 'es'}`}
                aria-label={`Pasta ${title}`}
                aria-expanded={open}
                onClick={() => toggleFolder(item.folder.id)}
              >
                {open ? (
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4.1c.5 0 .98.2 1.33.56L12.4 6H18.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11Z" /></svg>
                ) : (
                  <span className="rail-folder-grid" aria-hidden="true">
                    {item.servers.slice(0, 4).map((server) => (
                      <span key={server.id} className="rail-folder-tile">
                        {server.iconUrl ? <img src={server.iconUrl} alt="" draggable={false} /> : server.name.charAt(0).toUpperCase()}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            </div>
            {open && <div className="rail-folder-children">{item.servers.map((server) => renderServer(server, `${item.key}:${server.id}`, item.folder.id))}</div>}
          </div>
        );
      })}
      <ContextMenu state={menu.state} onClose={menu.close} />
      {editingFolder && (
        <FolderDialog
          folder={editingFolder}
          onClose={() => setEditingFolderId(null)}
          onSave={(patch) => update(editFolder(layout, serverIds, editingFolder.id, patch))}
          onUngroup={() => update(ungroupFolder(layout, serverIds, editingFolder.id))}
        />
      )}
    </>
  );
}
