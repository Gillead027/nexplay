import {
  SERVER_FOLDER_COLORS,
  SERVER_FOLDER_NAME_MAX_LENGTH,
  normalizeServerLayout,
  type Server,
  type ServerLayout,
  type ServerLayoutItem,
} from '@nexplay/shared';

// Pastas de servidores na barra lateral, como no Discord: arrastar um servidor sobre outro cria uma pasta, arrastar sobre uma
// pasta coloca dentro, arrastar entre os itens reordena. Este arquivo só decide QUEM fica ONDE (funções puras); a tela e o
// arrastar-e-soltar ficam em components/ServerRail.tsx.

export type FolderItem = Extract<ServerLayoutItem, { type: 'folder' }>;

export type RailItem =
  | { type: 'server'; key: string; server: Server }
  | { type: 'folder'; key: string; folder: FolderItem; servers: Server[] };

/** A lista da barra, na ordem do layout da pessoa (servidores novos no fim, servidores que ela deixou fora). */
export function arrangeRail(servers: readonly Server[], layout: ServerLayout): RailItem[] {
  const byId = new Map(servers.map((server) => [server.id, server]));
  const normalized = normalizeServerLayout(layout, servers.map((server) => server.id));
  const rail: RailItem[] = [];
  for (const item of normalized.items) {
    if (item.type === 'server') {
      const server = byId.get(item.serverId);
      if (server) rail.push({ type: 'server', key: `s:${server.id}`, server });
    } else {
      const members = item.serverIds.map((id) => byId.get(id)).filter((server): server is Server => Boolean(server));
      if (members.length > 0) rail.push({ type: 'folder', key: `f:${item.id}`, folder: item, servers: members });
    }
  }
  return rail;
}

export type DropMode = 'before' | 'after' | 'into';
export type DropTarget = { kind: 'server'; id: string } | { kind: 'folder'; id: string };

let folderCounter = 0;
const defaultFolderId = (): string => {
  folderCounter += 1;
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `pasta-${Date.now().toString(36)}-${folderCounter}`;
};

const withoutServer = (items: ServerLayoutItem[], serverId: string): ServerLayoutItem[] =>
  items
    .map((item): ServerLayoutItem => (item.type === 'folder' ? { ...item, serverIds: item.serverIds.filter((id) => id !== serverId) } : item))
    .filter((item) => (item.type === 'server' ? item.serverId !== serverId : item.serverIds.length > 0));

const indexOfServer = (items: ServerLayoutItem[], serverId: string): number =>
  items.findIndex((item) => item.type === 'server' && item.serverId === serverId);
const indexOfFolder = (items: ServerLayoutItem[], folderId: string): number =>
  items.findIndex((item) => item.type === 'folder' && item.id === folderId);

/**
 * Solta o servidor `draggedId` sobre `target`: antes, depois ou dentro (sobre outro servidor cria uma pasta com os dois; sobre
 * uma pasta entra nela). Sempre devolve um layout coerente com `serverIds` (todos os servidores, cada um uma vez só).
 */
export function dropServer(
  layout: ServerLayout,
  serverIds: readonly string[],
  draggedId: string,
  target: DropTarget,
  mode: DropMode,
  newFolderId: () => string = defaultFolderId,
): ServerLayout {
  const start = normalizeServerLayout(layout, serverIds).items;
  if (target.kind === 'server' && target.id === draggedId) return { items: start };
  if (!serverIds.includes(draggedId)) return { items: start };

  // Onde o alvo está: solto na barra ou dentro de uma pasta.
  const targetFolder =
    target.kind === 'server' ? start.find((item): item is FolderItem => item.type === 'folder' && item.serverIds.includes(target.id)) : undefined;

  const items = withoutServer(start, draggedId);

  if (target.kind === 'folder') {
    const at = indexOfFolder(items, target.id);
    // A pasta sumiu ao tirar dela o próprio servidor arrastado (era a única dentro): não há o que mudar.
    if (at < 0) return { items: start };
    if (mode === 'into') {
      const folder = items[at] as FolderItem;
      items[at] = { ...folder, serverIds: [...folder.serverIds, draggedId] };
    } else {
      items.splice(mode === 'before' ? at : at + 1, 0, { type: 'server', serverId: draggedId });
    }
    return normalizeServerLayout({ items }, serverIds);
  }

  // Alvo é um servidor dentro de uma pasta: soltar antes/depois reordena dentro dela; soltar "dentro" vale como depois.
  if (targetFolder) {
    const at = indexOfFolder(items, targetFolder.id);
    if (at >= 0) {
      const folder = items[at] as FolderItem;
      const position = folder.serverIds.indexOf(target.id);
      const insertAt = mode === 'before' ? position : position + 1;
      const ids = [...folder.serverIds];
      ids.splice(insertAt, 0, draggedId);
      items[at] = { ...folder, serverIds: ids };
      return normalizeServerLayout({ items }, serverIds);
    }
  }

  // Alvo é um servidor solto na barra.
  const at = indexOfServer(items, target.id);
  if (at < 0) return normalizeServerLayout({ items: [...items, { type: 'server', serverId: draggedId }] }, serverIds);
  if (mode === 'into') {
    const color = SERVER_FOLDER_COLORS[items.filter((item) => item.type === 'folder').length % SERVER_FOLDER_COLORS.length] ?? SERVER_FOLDER_COLORS[0]!;
    items[at] = { type: 'folder', id: newFolderId(), name: '', color, serverIds: [target.id, draggedId] };
  } else {
    items.splice(mode === 'before' ? at : at + 1, 0, { type: 'server', serverId: draggedId });
  }
  return normalizeServerLayout({ items }, serverIds);
}

/** Cria uma pasta com um servidor só (pelo menu do servidor, sem arrastar). */
export function createFolderWith(layout: ServerLayout, serverIds: readonly string[], serverId: string, newFolderId: () => string = defaultFolderId): ServerLayout {
  const items = normalizeServerLayout(layout, serverIds).items;
  const at = indexOfServer(items, serverId);
  const inFolder = items.some((item) => item.type === 'folder' && item.serverIds.includes(serverId));
  const color = SERVER_FOLDER_COLORS[items.filter((item) => item.type === 'folder').length % SERVER_FOLDER_COLORS.length] ?? SERVER_FOLDER_COLORS[0]!;
  if (at < 0 || inFolder) return { items };
  items[at] = { type: 'folder', id: newFolderId(), name: '', color, serverIds: [serverId] };
  return { items };
}

/** Coloca o servidor numa pasta que já existe (pelo menu do servidor). */
export function moveServerToFolder(layout: ServerLayout, serverIds: readonly string[], serverId: string, folderId: string): ServerLayout {
  return dropServer(layout, serverIds, serverId, { kind: 'folder', id: folderId }, 'into');
}

/** Tira o servidor da pasta e o deixa solto, logo depois dela. */
export function removeFromFolder(layout: ServerLayout, serverIds: readonly string[], serverId: string): ServerLayout {
  const start = normalizeServerLayout(layout, serverIds).items;
  const folder = start.find((item): item is FolderItem => item.type === 'folder' && item.serverIds.includes(serverId));
  if (!folder) return { items: start };
  const items = withoutServer(start, serverId);
  const at = indexOfFolder(items, folder.id);
  items.splice(at >= 0 ? at + 1 : items.length, 0, { type: 'server', serverId });
  return normalizeServerLayout({ items }, serverIds);
}

/** Muda o nome e a cor de uma pasta (o nome é aparado e limitado). */
export function editFolder(layout: ServerLayout, serverIds: readonly string[], folderId: string, patch: { name?: string; color?: string }): ServerLayout {
  const items = normalizeServerLayout(layout, serverIds).items.map((item): ServerLayoutItem => {
    if (item.type !== 'folder' || item.id !== folderId) return item;
    return {
      ...item,
      ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, SERVER_FOLDER_NAME_MAX_LENGTH) } : {}),
      ...(patch.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(patch.color) ? { color: patch.color } : {}),
    };
  });
  return { items };
}

/** Desfaz a pasta: os servidores dela ficam soltos, no mesmo lugar. */
export function ungroupFolder(layout: ServerLayout, serverIds: readonly string[], folderId: string): ServerLayout {
  const items: ServerLayoutItem[] = [];
  for (const item of normalizeServerLayout(layout, serverIds).items) {
    if (item.type === 'folder' && item.id === folderId) items.push(...item.serverIds.map((serverId): ServerLayoutItem => ({ type: 'server', serverId })));
    else items.push(item);
  }
  return { items };
}
