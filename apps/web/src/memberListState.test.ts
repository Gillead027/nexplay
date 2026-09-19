/// <reference types="node" />

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MemberSummary, RealtimeEvent } from '@nexplay/shared';
import { applyMemberEvent, applyPresenceEvent, groupMembersByPresence } from './memberListState.js';

const member = (id: string, displayName: string): MemberSummary => ({
  id,
  displayName,
  accentColor: '#4e7960',
  avatarUrl: '',
  statusText: '',
  roleIds: [],
  timeoutUntil: null,
});

const ana = member('u-ana', 'Ana');
const bia = member('u-bia', 'bia');
const cid = member('u-cid', 'Cid');
const davi = member('u-davi', 'Álvaro');

describe('online em cima, offline embaixo', () => {
  it('separa quem está online de quem não está', () => {
    const groups = groupMembersByPresence([ana, bia, cid], new Set(['u-bia']), 'outra-pessoa');
    assert.deepEqual(groups.online.map((m) => m.id), ['u-bia']);
    assert.deepEqual(groups.offline.map((m) => m.id), ['u-ana', 'u-cid']);
  });

  it('ordena cada grupo por nome, sem diferenciar maiúscula nem acento', () => {
    const groups = groupMembersByPresence([cid, bia, davi, ana], new Set(['u-cid', 'u-bia', 'u-davi', 'u-ana']), 'x');
    assert.deepEqual(groups.online.map((m) => m.displayName), ['Álvaro', 'Ana', 'bia', 'Cid']);
  });

  it('quem abre a lista sempre aparece como online, mesmo antes de a própria conexão ser registrada', () => {
    const groups = groupMembersByPresence([ana, bia], new Set(), 'u-ana');
    assert.deepEqual(groups.online.map((m) => m.id), ['u-ana']);
    assert.deepEqual(groups.offline.map((m) => m.id), ['u-bia']);
  });

  it('quando alguém fica online ele sobe para a categoria de cima e sai da de offline', () => {
    const before = groupMembersByPresence([ana, bia], new Set(), 'nobody');
    assert.equal(before.online.length, 0);
    const after = groupMembersByPresence([ana, bia], new Set(['u-bia']), 'nobody');
    assert.deepEqual(after.online.map((m) => m.id), ['u-bia']);
    assert.deepEqual(after.offline.map((m) => m.id), ['u-ana']);
  });

  it('todo mundo offline deixa a categoria de online vazia, e vice-versa', () => {
    assert.equal(groupMembersByPresence([ana], new Set(), 'x').online.length, 0);
    assert.equal(groupMembersByPresence([ana], new Set(['u-ana']), 'x').offline.length, 0);
  });

  it('não repete a mesma pessoa e não altera a lista original', () => {
    const original = [bia, ana, ana];
    const groups = groupMembersByPresence(original, new Set(), 'x');
    assert.equal(groups.offline.length, 2);
    assert.deepEqual(original.map((m) => m.id), ['u-bia', 'u-ana', 'u-ana']);
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

  it('eventos que não interessam devolvem a mesma lista', () => {
    const list = [ana];
    assert.equal(applyMemberEvent(list, { type: 'MEMBER_LEAVE', serverId: 's1', userId: 'ninguem' }, 's1'), list);
    assert.equal(applyMemberEvent(list, { type: 'PRESENCE_UPDATE', userId: 'u-ana', online: true }, 's1'), list);
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
