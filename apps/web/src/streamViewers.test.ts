import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WATCHING_ATTRIBUTE } from '@nexplay/shared';
import { nextViewerBaseline, remoteViewersByStreamer, serializeWatching, viewerCount, viewerCountLabel, watchingByIdentity, type ViewerParticipant } from './streamViewers';

const person = (identity: string, watching: string[] = [], isLocal = false): ViewerParticipant => ({
  identity, isLocal, attributes: watching.length ? { [WATCHING_ATTRIBUTE]: serializeWatching(watching) } : {},
});

test('o atributo é guardado sem repetição e em ordem fixa (só republica quando muda de verdade)', () => {
  assert.equal(serializeWatching(['b', 'a', 'b']), 'a,b');
  assert.equal(serializeWatching([]), '');
});

test('conta quem assiste cada transmissão; ninguém conta assistindo a própria tela; quem não publica não conta', () => {
  const people = [person('ana', [], true), person('bia', ['ana']), person('caio', ['ana', 'bia']), person('dora', ['dora']), person('antigo')];
  const remote = remoteViewersByStreamer(people);
  assert.deepEqual(remote.get('ana'), ['bia', 'caio']);
  assert.deepEqual(remote.get('bia'), ['caio']);
  assert.equal(remote.get('dora'), undefined);
  assert.equal(viewerCount('ana', remote, false), 2);
  assert.equal(viewerCount('bia', remote, true), 2); // caio + eu
  assert.equal(viewerCount('caio', remote, false), 0);
});

test('o olhinho vale para quem está assistindo qualquer transmissão; você usa o seu estado local', () => {
  const people = [person('ana', ['x'], true), person('bia', ['ana']), person('caio'), person('dora', ['dora'])];
  const eyes = watchingByIdentity(people, true);
  assert.equal(eyes.get('ana'), true); // eu (estado local, o atributo ecoado não importa)
  assert.equal(eyes.get('bia'), true);
  assert.equal(eyes.get('caio'), false);
  assert.equal(eyes.get('dora'), false);
  assert.equal(watchingByIdentity(people, false).get('ana'), false);
});

test('o texto da contagem: na própria transmissão diz até quando ninguém assiste; nas dos outros só com gente assistindo', () => {
  assert.equal(viewerCountLabel(0, true), 'Ninguém assistindo');
  assert.equal(viewerCountLabel(1, true), '1 pessoa assistindo');
  assert.equal(viewerCountLabel(3, true), '3 pessoas assistindo');
  assert.equal(viewerCountLabel(0, false), null);
  assert.equal(viewerCountLabel(1, false), '1 assistindo');
  assert.equal(viewerCountLabel(4, false), '4 assistindo');
});

test('sons: a primeira leitura só marca o ponto de partida; depois entrar e sair (sem sair da chamada) contam', () => {
  const inCall = new Set(['bia', 'caio', 'dora']);
  const stillIn = (id: string) => inCall.has(id);
  const relevant = new Set(['ana']);
  // primeira leitura: bia já estava assistindo antes — sem som
  const first = nextViewerBaseline(new Map(), new Map([['ana', ['bia']]]), relevant, stillIn);
  assert.deepEqual([first.joined, first.left], [0, 0]);
  // caio entra
  const second = nextViewerBaseline(first.baseline, new Map([['ana', ['bia', 'caio']]]), relevant, stillIn);
  assert.deepEqual([second.joined, second.left], [1, 0]);
  // bia para de assistir mas continua na chamada
  const third = nextViewerBaseline(second.baseline, new Map([['ana', ['caio']]]), relevant, stillIn);
  assert.deepEqual([third.joined, third.left], [0, 1]);
  // caio sai da CHAMADA: a contagem cai, mas o som é o de sair da chamada, não este
  inCall.delete('caio');
  const fourth = nextViewerBaseline(third.baseline, new Map(), relevant, stillIn);
  assert.deepEqual([fourth.joined, fourth.left], [0, 0]);
  assert.deepEqual([...fourth.baseline.entries()], [['ana', []]]);
});

test('transmissão que deixa de interessar (acabou, ou você parou de assistir) sai do ponto de partida, sem som', () => {
  const first = nextViewerBaseline(new Map(), new Map([['ana', ['bia']], ['caio', ['dora']]]), new Set(['ana', 'caio']), () => true);
  const later = nextViewerBaseline(first.baseline, new Map(), new Set(['ana']), () => true);
  assert.deepEqual([later.joined, later.left], [0, 1]); // bia saiu de ana; caio deixou de interessar (sem contar)
  assert.deepEqual([...later.baseline.keys()], ['ana']);
  // voltar a assistir 'caio' depois: é uma leitura nova (ponto de partida), sem som
  const back = nextViewerBaseline(later.baseline, new Map([['caio', ['dora']]]), new Set(['ana', 'caio']), () => true);
  assert.deepEqual([back.joined, back.left], [0, 0]);
});
