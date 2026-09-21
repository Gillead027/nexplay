import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POKEMON_SPECIES } from './pokemonData.js';
import { POKEMON_STATS } from './pokemonStats.js';
import { POKEMON_TYPE_NAMES, attackDamage, battleInfoOf, effectiveness, simulateBattle, typeMultiplier } from './pokemonBattle.js';

const TYPE = Object.fromEntries(POKEMON_TYPE_NAMES.map((name, index) => [name, index])) as Record<(typeof POKEMON_TYPE_NAMES)[number], number>;
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

test('os dados de tipos e atributos cobrem as 1025 espécies, na mesma ordem da lista de nomes', () => {
  assert.equal(POKEMON_STATS.length, POKEMON_SPECIES.length);
  POKEMON_STATS.forEach((row, index) => {
    assert.equal(row[0], index + 1);
    assert.ok(row[1] >= 0 && row[1] < POKEMON_TYPE_NAMES.length, `tipo 1 de #${row[0]}`);
    assert.ok(row[2] === -1 || (row[2] >= 0 && row[2] < POKEMON_TYPE_NAMES.length), `tipo 2 de #${row[0]}`);
    for (const stat of row.slice(3)) assert.ok(stat > 0 && stat < 256, `atributo de #${row[0]}`);
  });
  // conferindo com espécies conhecidas
  const pikachu = battleInfoOf(25);
  assert.deepEqual(pikachu.types, [TYPE['Elétrico']]);
  assert.equal(pikachu.speed, 90);
  assert.deepEqual(battleInfoOf(6).types, [TYPE['Fogo'], TYPE['Voador']]);
});

test('a tabela de tipos segue as regras clássicas', () => {
  assert.equal(typeMultiplier(TYPE['Água'], TYPE['Fogo']), 2);
  assert.equal(typeMultiplier(TYPE['Fogo'], TYPE['Água']), 0.5);
  assert.equal(typeMultiplier(TYPE['Elétrico'], TYPE['Terrestre']), 0);
  assert.equal(typeMultiplier(TYPE['Normal'], TYPE['Fantasma']), 0);
  assert.equal(typeMultiplier(TYPE['Fantasma'], TYPE['Normal']), 0);
  assert.equal(typeMultiplier(TYPE['Dragão'], TYPE['Fada']), 0);
  assert.equal(typeMultiplier(TYPE['Fada'], TYPE['Dragão']), 2);
  assert.equal(typeMultiplier(TYPE['Planta'], TYPE['Água']), 2);
  assert.equal(typeMultiplier(TYPE['Normal'], TYPE['Normal']), 1);
  // dois tipos se multiplicam: Planta contra Água/Terrestre é 4x; Elétrico contra Água/Voador também
  assert.equal(effectiveness(TYPE['Planta'], [TYPE['Água'], TYPE['Terrestre']]), 4);
  assert.equal(effectiveness(TYPE['Elétrico'], [TYPE['Água'], TYPE['Voador']]), 4);
  assert.equal(effectiveness(TYPE['Fogo'], [TYPE['Água'], TYPE['Pedra']]), 0.25);
});

test('cada tipo é forte contra alguém, exceto o Normal, e nunca há um tipo imune a tudo', () => {
  for (let attacker = 1; attacker < POKEMON_TYPE_NAMES.length; attacker += 1) {
    const strong = POKEMON_TYPE_NAMES.some((_, defender) => typeMultiplier(attacker, defender) === 2);
    assert.ok(strong, `${POKEMON_TYPE_NAMES[attacker]} é forte contra alguém`);
  }
  assert.ok(!POKEMON_TYPE_NAMES.some((_, defender) => typeMultiplier(TYPE['Normal'], defender) === 2));
});

test('o dano nunca é zero e um golpe super eficaz bate mais forte que um pouco eficaz', () => {
  const fixed = () => 0.5;
  const squirtle = battleInfoOf(7);
  const charmander = battleInfoOf(4);
  const water = attackDamage(squirtle, charmander, fixed);
  const fire = attackDamage(charmander, squirtle, fixed);
  assert.equal(water.multiplier, 2);
  assert.equal(fire.multiplier, 0.5);
  assert.ok(water.amount > fire.amount);
  // até um golpe imune faz o mínimo de dano (para nenhuma batalha travar)
  const gastly = battleInfoOf(92);
  const normalHitter = { ...battleInfoOf(143), types: [TYPE['Normal']] };
  const immune = attackDamage(normalHitter, gastly, fixed);
  assert.equal(immune.multiplier, 0);
  assert.ok(immune.amount >= 1);
});

test('uma batalha termina sempre, tem um vencedor e contabiliza os Pokémon que caíram', () => {
  const rng = seeded(7);
  for (let round = 0; round < 300; round += 1) {
    const size = 1 + Math.floor(rng() * 6);
    const a = Array.from({ length: size }, () => 1 + Math.floor(rng() * 1025));
    const b = Array.from({ length: 1 + Math.floor(rng() * 6) }, () => 1 + Math.floor(rng() * 1025));
    const result = simulateBattle(a, b, rng);
    assert.ok(result.winner === 'A' || result.winner === 'B');
    assert.ok(result.remainingA >= 0 && result.remainingB >= 0);
    // quem ganhou ainda tem Pokémon de pé e quem perdeu não
    if (result.winner === 'A') { assert.ok(result.remainingA > 0); assert.equal(result.remainingB, 0); }
    else { assert.ok(result.remainingB > 0); assert.equal(result.remainingA, 0); }
    const fallenA = result.knockouts.filter((knockout) => knockout.side === 'B').length;
    const fallenB = result.knockouts.filter((knockout) => knockout.side === 'A').length;
    assert.equal(fallenA, a.length - result.remainingA);
    assert.equal(fallenB, b.length - result.remainingB);
    for (const knockout of result.knockouts) assert.ok(knockout.hpLeftPercent >= 1 && knockout.hpLeftPercent <= 100);
  }
});

test('um lendário forte vence um Pokémon fraco quase sempre', () => {
  const rng = seeded(99);
  let wins = 0;
  for (let round = 0; round < 200; round += 1) {
    // Mewtwo (150) contra Caterpie (10)
    if (simulateBattle([150], [10], rng).winner === 'A') wins += 1;
  }
  assert.ok(wins >= 195, `Mewtwo ganhou ${wins}/200`);
});

test('em um espelho (mesma velocidade) a sorte decide quem ataca primeiro, e quem ataca primeiro vence', () => {
  assert.equal(simulateBattle([25], [25], () => 0.4).winner, 'A');
  assert.equal(simulateBattle([25], [25], () => 0.9).winner, 'B');
  // em times iguais quem ganha um duelo segue com a vida que sobrou, então o lado que começa na frente vence mas não sai ileso
  const long = simulateBattle([25, 25, 25], [25, 25, 25], () => 0.4);
  assert.equal(long.winner, 'A');
  assert.ok(long.remainingA >= 1 && long.remainingA <= 3);
  assert.equal(long.remainingB, 0);
});

test('a mesma sorte dá sempre o mesmo resultado', () => {
  const first = simulateBattle([1, 4, 7], [25, 39, 133], seeded(5));
  const second = simulateBattle([1, 4, 7], [25, 39, 133], seeded(5));
  assert.deepEqual(first, second);
});
