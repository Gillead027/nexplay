import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Server, ServerLayout } from '@nexplay/shared';
import { arrangeRail, createFolderWith, dropServer, editFolder, moveServerToFolder, removeFromFolder, ungroupFolder } from './serverFolders';

const ids = ['a', 'b', 'c', 'd'];
const servers = ids.map((id) => ({ id, name: id.toUpperCase() }) as Server);
const flat: ServerLayout = { items: ids.map((serverId) => ({ type: 'server', serverId }) as const) };
let counter = 0;
const nextId = () => `f${++counter}`;
const shape = (layout: ServerLayout) => layout.items.map((item) => (item.type === 'server' ? item.serverId : `[${item.serverIds.join('')}]`)).join(' ');

test('a barra segue o layout, junta servidores novos no fim e ignora os que a pessoa deixou', () => {
  const layout: ServerLayout = { items: [{ type: 'folder', id: 'f', name: 'Jogos', color: '#3b82f6', serverIds: ['c', 'x', 'a'] }, { type: 'server', serverId: 'b' }] };
  const rail = arrangeRail(servers, layout);
  assert.deepEqual(rail.map((item) => (item.type === 'server' ? item.server.id : item.servers.map((server) => server.id).join(''))), ['ca', 'b', 'd']);
  assert.equal(rail[0]!.type, 'folder');
  assert.equal(arrangeRail(servers, { items: [] }).length, 4);
});

test('soltar um servidor sobre outro cria uma pasta com os dois, na posição do alvo', () => {
  const result = dropServer(flat, ids, 'd', { kind: 'server', id: 'b' }, 'into', nextId);
  assert.equal(shape(result), 'a [bd] c');
  const folder = result.items[1]!;
  assert.ok(folder.type === 'folder' && folder.id === 'f1' && folder.name === '' && /^#[0-9a-f]{6}$/i.test(folder.color));
});

test('soltar sobre uma pasta coloca dentro; antes e depois reordenam sem entrar', () => {
  const withFolder = dropServer(flat, ids, 'b', { kind: 'server', id: 'a' }, 'into', () => 'pasta');
  assert.equal(shape(withFolder), '[ab] c d');
  assert.equal(shape(dropServer(withFolder, ids, 'd', { kind: 'folder', id: 'pasta' }, 'into')), '[abd] c');
  assert.equal(shape(dropServer(withFolder, ids, 'd', { kind: 'folder', id: 'pasta' }, 'before')), 'd [ab] c');
  assert.equal(shape(dropServer(withFolder, ids, 'c', { kind: 'folder', id: 'pasta' }, 'after')), '[ab] c d');
  assert.equal(shape(dropServer(flat, ids, 'a', { kind: 'server', id: 'c' }, 'after')), 'b c a d');
  assert.equal(shape(dropServer(flat, ids, 'd', { kind: 'server', id: 'a' }, 'before')), 'd a b c');
});

test('arrastar entre os servidores de uma pasta reordena dentro dela; arrastar para fora tira da pasta', () => {
  const withFolder = dropServer(dropServer(flat, ids, 'b', { kind: 'server', id: 'a' }, 'into', () => 'pasta'), ids, 'c', { kind: 'folder', id: 'pasta' }, 'into');
  assert.equal(shape(withFolder), '[abc] d');
  assert.equal(shape(dropServer(withFolder, ids, 'c', { kind: 'server', id: 'a' }, 'before')), '[cab] d');
  // solto sobre um servidor solto, ele sai da pasta
  assert.equal(shape(dropServer(withFolder, ids, 'a', { kind: 'server', id: 'd' }, 'after')), '[bc] d a');
});

test('uma pasta que fica vazia some; soltar um servidor sobre si mesmo não muda nada', () => {
  const single = createFolderWith(flat, ids, 'b', () => 'solo');
  assert.equal(shape(single), 'a [b] c d');
  // o único servidor da pasta é levado para outro lugar: a pasta some
  assert.equal(shape(dropServer(single, ids, 'b', { kind: 'server', id: 'd' }, 'after')), 'a c d b');
  assert.equal(shape(dropServer(flat, ids, 'a', { kind: 'server', id: 'a' }, 'into')), 'a b c d');
  // id que não é servidor da pessoa é ignorado
  assert.equal(shape(dropServer(flat, ids, 'zzz', { kind: 'server', id: 'a' }, 'into')), 'a b c d');
});

test('pelo menu do servidor: criar pasta, mover para uma pasta, tirar da pasta e desfazer a pasta', () => {
  const created = createFolderWith(flat, ids, 'c', () => 'pasta-c');
  assert.equal(shape(created), 'a b [c] d');
  assert.equal(shape(createFolderWith(created, ids, 'c', () => 'outra')), 'a b [c] d', 'quem já está numa pasta não cria outra');
  const moved = moveServerToFolder(created, ids, 'a', 'pasta-c');
  assert.equal(shape(moved), 'b [ca] d');
  assert.equal(shape(removeFromFolder(moved, ids, 'c')), 'b [a] c d');
  assert.equal(shape(removeFromFolder(moved, ids, 'b')), 'b [ca] d', 'quem já está solto não muda');
  assert.equal(shape(ungroupFolder(moved, ids, 'pasta-c')), 'b c a d');
});

test('nome e cor da pasta: nome aparado e limitado, cor só no formato certo', () => {
  const layout = createFolderWith(flat, ids, 'a', () => 'p');
  const named = editFolder(layout, ids, 'p', { name: `   ${'x'.repeat(50)}   `, color: '#22c55e' });
  const folder = named.items[0]!;
  assert.ok(folder.type === 'folder');
  assert.equal(folder.name.length, 32);
  assert.equal(folder.color, '#22c55e');
  const bad = editFolder(named, ids, 'p', { color: 'vermelho' }).items[0]!;
  assert.ok(bad.type === 'folder' && bad.color === '#22c55e');
});
