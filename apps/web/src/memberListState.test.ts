/// <reference types="node" />

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MemberSummary, RealtimeEvent, Role } from '@nexplay/shared';
import { applyMemberEvent, applyPresenceEvent, applyRoleEvent, buildMemberSections } from './memberListState.js';

const member = (id: string, displayName: string, roleIds: string[] = []): MemberSummary => ({
  id,
  displayName,
  accentColor: '#4e7960',
  avatarUrl: '',
  statusText: '',
  roleIds,
  timeoutUntil: null,
});

const role = (id: string, name: string, position: number, hoist: boolean, isEveryone = false): Role => ({
  id,
  serverId: 's1',
  name,
  color: '#ffffff',
  position,
  hoist,
  permissions: 0,
  createdAt: 0,
  isEveryone,
});

const everyone = role('r-all', '@everyone', 0, false, true);
const admin = role('r-adm', 'Administrador', 100, true);
const mods = role('r-mod', 'Moderadores', 99, true);
const plain = role('r-plain', 'Membro', 50, false);

const ana = member('u-ana', 'Ana', ['r-all', 'r-adm']);
const bia = member('u-bia', 'bia', ['r-all', 'r-mod']);
const cid = member('u-cid', 'Cid', ['r-all']);
const davi = member('u-davi', 'Álvaro', ['r-all', 'r-plain']);

const titles = (sections: ReturnType<typeof buildMemberSections>) => sections.map((s) => `${s.title}:${s.members.map((m) => m.id).join(',')}`);

describe('categorias do painel de membros', () => {
  it('cargo separado vira categoria só para quem está online; Online e Offline vêm depois', () => {
    const sections = buildMemberSections(
      [ana, bia, cid, davi],
      new Set(['u-ana', 'u-bia', 'u-cid']),
      'ninguem',
      [everyone, admin, mods, plain],
    );
    assert.deepEqual(titles(sections), ['Administrador:u-ana', 'Moderadores:u-bia', 'Online:u-cid', 'Offline:u-davi']);
  });

  it('ordena as categorias de cargo do cargo mais alto para o mais baixo', () => {
    const sections = buildMemberSections([bia, ana], new Set(['u-ana', 'u-bia']), 'x', [everyone, mods, admin]);
    assert.deepEqual(sections.map((s) => s.title), ['Administrador', 'Moderadores']);
  });

  it('cargos empatados em posição desempatam por nome', () => {
    const a = role('r-a', 'Alfa', 10, true);
    const b = role('r-b', 'Beta', 10, true);
    const sections = buildMemberSections(
      [member('u-1', 'Um', ['r-b']), member('u-2', 'Dois', ['r-a'])],
      new Set(['u-1', 'u-2']),
      'x',
      [b, a],
    );
    assert.deepEqual(sections.map((s) => s.title), ['Alfa', 'Beta']);
  });

  it('quem tem vários cargos separados fica só no mais alto, sem repetir', () => {
    const both = member('u-both', 'Duplo', ['r-mod', 'r-adm']);
    const sections = buildMemberSections([both], new Set(['u-both']), 'x', [mods, admin]);
    assert.deepEqual(titles(sections), ['Administrador:u-both']);
  });

  it('todo mundo offline fica junto em Offline, qualquer que seja o cargo', () => {
    const sections = buildMemberSections([ana, bia, cid], new Set(), 'nobody', [everyone, admin, mods]);
    assert.deepEqual(titles(sections), ['Offline:u-ana,u-bia,u-cid']);
  });

  it('cargo sem "Exibir separadamente" ligado, e o @everyone, não viram categoria', () => {
    const sections = buildMemberSections([davi, cid], new Set(['u-davi', 'u-cid']), 'x', [everyone, plain, admin]);
    // uma categoria só, em ordem alfabética sem acento: Álvaro (u-davi) antes de Cid
    assert.deepEqual(titles(sections), ['Online:u-davi,u-cid']);
  });

  it('um @everyone marcado como separado continua sem virar categoria', () => {
    const sections = buildMemberSections([cid], new Set(['u-cid']), 'x', [role('r-all', '@everyone', 0, true, true)]);
    assert.deepEqual(titles(sections), ['Online:u-cid']);
  });

  it('categorias vazias não aparecem', () => {
    const sections = buildMemberSections([cid], new Set(['u-cid']), 'x', [everyone, admin, mods]);
    assert.deepEqual(sections.map((s) => s.kind), ['online']);
  });

  it('dentro de cada categoria a ordem é alfabética, sem diferenciar maiúscula nem acento', () => {
    const list = [member('u-1', 'Cid'), member('u-2', 'bia'), member('u-3', 'Álvaro'), member('u-4', 'Ana')];
    const sections = buildMemberSections(list, new Set(list.map((m) => m.id)), 'x', []);
    assert.deepEqual(sections[0]?.members.map((m) => m.displayName), ['Álvaro', 'Ana', 'bia', 'Cid']);
  });

  it('quem abre a lista sempre conta como online e cai na categoria do próprio cargo', () => {
    const sections = buildMemberSections([ana, bia], new Set(), 'u-ana', [everyone, admin, mods]);
    assert.deepEqual(titles(sections), ['Administrador:u-ana', 'Offline:u-bia']);
  });

  it('quando alguém fica online ele sobe da categoria Offline para a do cargo dele', () => {
    const roles = [everyone, admin, mods];
    const before = buildMemberSections([ana, bia], new Set(), 'nobody', roles);
    assert.deepEqual(titles(before), ['Offline:u-ana,u-bia']);
    const after = buildMemberSections([ana, bia], new Set(['u-bia']), 'nobody', roles);
    assert.deepEqual(titles(after), ['Moderadores:u-bia', 'Offline:u-ana']);
  });

  it('não repete a mesma pessoa e não altera a lista original', () => {
    const original = [cid, ana, ana];
    const sections = buildMemberSections(original, new Set(), 'x', []);
    assert.equal(sections[0]?.members.length, 2);
    assert.deepEqual(original.map((m) => m.id), ['u-cid', 'u-ana', 'u-ana']);
  });

  it('sem membros, sem categorias', () => {
    assert.deepEqual(buildMemberSections([], new Set(), 'x', [admin]), []);
  });
});

describe('eventos da lista de membros', () => {
  const join: RealtimeEvent = { type: 'MEMBER_JOIN', serverId: 's1', member: cid };

  it('entrada de membro no servidor aberto adiciona, sem duplicar', () => {
    assert.deepEqual(applyMemberEvent([ana], join, 's1').map((m) => m.id), ['u-ana', 'u-cid']);
    assert.deepEqual(applyMemberEvent([ana, cid], join, 's1').map((m) => m.id), ['u-ana', 'u-cid']);
  });

  it('ignora entrada e saída de outro servidor', () => {
    const list = [ana];
    assert.equal(applyMemberEvent(list, { type: 'MEMBER_JOIN', serverId: 'outro', member: cid }, 's1'), list);
    assert.equal(applyMemberEvent(list, { type: 'MEMBER_LEAVE', serverId: 'outro', userId: 'u-ana' }, 's1'), list);
  });

  it('saída de membro remove', () => {
    assert.deepEqual(applyMemberEvent([ana, bia], { type: 'MEMBER_LEAVE', serverId: 's1', userId: 'u-ana' }, 's1').map((m) => m.id), ['u-bia']);
  });

  it('banimento remove a pessoa em qualquer servidor (vale para a instância inteira)', () => {
    assert.deepEqual(applyMemberEvent([ana, bia], { type: 'MEMBER_BANNED', userId: 'u-bia' }, 's1').map((m) => m.id), ['u-ana']);
  });

  it('mudança de cargos de um membro atualiza os cargos dele, e só dele', () => {
    const next = applyMemberEvent([cid, ana], { type: 'MEMBER_ROLES_UPDATE', serverId: 's1', userId: 'u-cid', roleIds: ['r-all', 'r-adm'] }, 's1');
    assert.deepEqual(next.find((m) => m.id === 'u-cid')?.roleIds, ['r-all', 'r-adm']);
    assert.deepEqual(next.find((m) => m.id === 'u-ana')?.roleIds, ['r-all', 'r-adm']);
    assert.deepEqual(cid.roleIds, ['r-all'], 'o objeto original não é alterado');
  });

  it('mudança de cargos de outro servidor ou de quem não está na lista não muda nada', () => {
    const list = [cid];
    assert.equal(applyMemberEvent(list, { type: 'MEMBER_ROLES_UPDATE', serverId: 'outro', userId: 'u-cid', roleIds: [] }, 's1'), list);
    assert.equal(applyMemberEvent(list, { type: 'MEMBER_ROLES_UPDATE', serverId: 's1', userId: 'ninguem', roleIds: [] }, 's1'), list);
  });

  it('eventos que não interessam devolvem a mesma lista', () => {
    const list = [ana];
    assert.equal(applyMemberEvent(list, { type: 'MEMBER_LEAVE', serverId: 's1', userId: 'ninguem' }, 's1'), list);
    assert.equal(applyMemberEvent(list, { type: 'PRESENCE_UPDATE', userId: 'u-ana', online: true }, 's1'), list);
  });
});

describe('eventos de cargos', () => {
  it('criar e atualizar um cargo o coloca (ou troca) na lista', () => {
    const created = applyRoleEvent([everyone], { type: 'ROLE_CREATE', serverId: 's1', role: admin }, 's1');
    assert.deepEqual(created.map((r) => r.id).sort(), ['r-adm', 'r-all']);
    const updated = applyRoleEvent(created, { type: 'ROLE_UPDATE', serverId: 's1', role: { ...admin, hoist: false } }, 's1');
    assert.equal(updated.find((r) => r.id === 'r-adm')?.hoist, false);
    assert.equal(updated.length, 2);
  });

  it('ligar "Exibir separadamente" cria a categoria na hora, e desligar a remove', () => {
    const online = new Set(['u-cid']);
    const comCargo = member('u-cid', 'Cid', ['r-all', 'r-plain']);
    const off = buildMemberSections([comCargo], online, 'x', [everyone, plain]);
    assert.deepEqual(off.map((s) => s.title), ['Online']);
    const roles = applyRoleEvent([everyone, plain], { type: 'ROLE_UPDATE', serverId: 's1', role: { ...plain, hoist: true } }, 's1');
    assert.deepEqual(buildMemberSections([comCargo], online, 'x', roles).map((s) => s.title), ['Membro']);
  });

  it('apagar um cargo o tira da lista, e cargos de outro servidor são ignorados', () => {
    const roles = [everyone, admin];
    assert.deepEqual(applyRoleEvent(roles, { type: 'ROLE_DELETE', serverId: 's1', roleId: 'r-adm' }, 's1').map((r) => r.id), ['r-all']);
    assert.equal(applyRoleEvent(roles, { type: 'ROLE_DELETE', serverId: 'outro', roleId: 'r-adm' }, 's1'), roles);
    assert.equal(applyRoleEvent(roles, { type: 'ROLE_CREATE', serverId: 'outro', role: mods }, 's1'), roles);
    assert.equal(applyRoleEvent(roles, { type: 'ROLE_DELETE', serverId: 's1', roleId: 'inexistente' }, 's1'), roles);
  });
});

describe('eventos de presença', () => {
  it('online adiciona e offline remove', () => {
    const start: ReadonlySet<string> = new Set();
    const on = applyPresenceEvent(start, { type: 'PRESENCE_UPDATE', userId: 'u-ana', online: true });
    assert.deepEqual([...on], ['u-ana']);
    const off = applyPresenceEvent(on, { type: 'PRESENCE_UPDATE', userId: 'u-ana', online: false });
    assert.deepEqual([...off], []);
    assert.equal(start.size, 0, 'o conjunto anterior não é alterado');
  });

  it('não muda nada (mesma referência) quando o estado já é aquele', () => {
    const start: ReadonlySet<string> = new Set(['u-ana']);
    assert.equal(applyPresenceEvent(start, { type: 'PRESENCE_UPDATE', userId: 'u-ana', online: true }), start);
    assert.equal(applyPresenceEvent(start, { type: 'PRESENCE_UPDATE', userId: 'u-bia', online: false }), start);
  });

  it('ignora outros tipos de evento', () => {
    const start: ReadonlySet<string> = new Set(['u-ana']);
    assert.equal(applyPresenceEvent(start, { type: 'MEMBER_LEAVE', serverId: 's', userId: 'u-ana' }), start);
  });
});
