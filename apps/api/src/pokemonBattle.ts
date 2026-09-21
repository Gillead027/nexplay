import { POKEMON_SPECIES } from './pokemonData.js';
import { POKEMON_STATS } from './pokemonStats.js';

// Regras das batalhas do NexDex: sem níveis nem golpes escolhidos; cada Pokémon luta com os atributos base da espécie e o
// melhor tipo dele contra o do adversário. Tudo aqui é puro (a sorte entra por parâmetro), para poder testar.

// Mesma ordem em que a PokeAPI numera os tipos (é o que está em pokemonStats.ts).
export const POKEMON_TYPE_NAMES = [
  'Normal', 'Lutador', 'Voador', 'Venenoso', 'Terrestre', 'Pedra', 'Inseto', 'Fantasma', 'Aço',
  'Fogo', 'Água', 'Planta', 'Elétrico', 'Psíquico', 'Gelo', 'Dragão', 'Sombrio', 'Fada',
] as const;

const T = { normal: 0, fighting: 1, flying: 2, poison: 3, ground: 4, rock: 5, bug: 6, ghost: 7, steel: 8, fire: 9, water: 10, grass: 11, electric: 12, psychic: 13, ice: 14, dragon: 15, dark: 16, fairy: 17 } as const;

// Tipo atacante: [bom contra (2x), fraco contra (0,5x), não afeta (0x)].
const CHART: readonly (readonly [readonly number[], readonly number[], readonly number[]])[] = [
  /* normal   */ [[], [T.rock, T.steel], [T.ghost]],
  /* fighting */ [[T.normal, T.rock, T.steel, T.ice, T.dark], [T.flying, T.poison, T.bug, T.psychic, T.fairy], [T.ghost]],
  /* flying   */ [[T.fighting, T.bug, T.grass], [T.rock, T.steel, T.electric], []],
  /* poison   */ [[T.grass, T.fairy], [T.poison, T.ground, T.rock, T.ghost], [T.steel]],
  /* ground   */ [[T.poison, T.rock, T.steel, T.fire, T.electric], [T.bug, T.grass], [T.flying]],
  /* rock     */ [[T.flying, T.bug, T.fire, T.ice], [T.fighting, T.ground, T.steel], []],
  /* bug      */ [[T.grass, T.psychic, T.dark], [T.fighting, T.flying, T.poison, T.ghost, T.steel, T.fire, T.fairy], []],
  /* ghost    */ [[T.ghost, T.psychic], [T.dark], [T.normal]],
  /* steel    */ [[T.rock, T.ice, T.fairy], [T.steel, T.fire, T.water, T.electric], []],
  /* fire     */ [[T.bug, T.steel, T.grass, T.ice], [T.rock, T.fire, T.water, T.dragon], []],
  /* water    */ [[T.ground, T.rock, T.fire], [T.water, T.grass, T.dragon], []],
  /* grass    */ [[T.ground, T.rock, T.water], [T.flying, T.poison, T.bug, T.steel, T.fire, T.grass, T.dragon], []],
  /* electric */ [[T.flying, T.water], [T.grass, T.electric, T.dragon], [T.ground]],
  /* psychic  */ [[T.fighting, T.poison], [T.steel, T.psychic], [T.dark]],
  /* ice      */ [[T.flying, T.ground, T.grass, T.dragon], [T.steel, T.fire, T.water, T.ice], []],
  /* dragon   */ [[T.dragon], [T.steel], [T.fairy]],
  /* dark     */ [[T.ghost, T.psychic], [T.fighting, T.dark, T.fairy], []],
  /* fairy    */ [[T.fighting, T.dragon, T.dark], [T.poison, T.steel, T.fire], []],
];

export function typeMultiplier(attackerType: number, defenderType: number): number {
  const entry = CHART[attackerType];
  if (!entry) return 1;
  if (entry[2].includes(defenderType)) return 0;
  if (entry[0].includes(defenderType)) return 2;
  if (entry[1].includes(defenderType)) return 0.5;
  return 1;
}

// O golpe de um tipo contra um Pokémon de um ou dois tipos: os multiplicadores se somam em produto.
export function effectiveness(attackerType: number, defenderTypes: readonly number[]): number {
  return defenderTypes.reduce((product, type) => product * typeMultiplier(attackerType, type), 1);
}

export interface SpeciesBattleInfo {
  types: number[];
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

export function battleInfoOf(speciesId: number): SpeciesBattleInfo {
  const row = POKEMON_STATS[speciesId - 1];
  if (!row) return { types: [T.normal], hp: 50, attack: 50, defense: 50, specialAttack: 50, specialDefense: 50, speed: 50 };
  return {
    types: row[2] >= 0 ? [row[1], row[2]] : [row[1]],
    hp: row[3],
    attack: row[4],
    defense: row[5],
    specialAttack: row[6],
    specialDefense: row[7],
    speed: row[8],
  };
}

export const speciesNameOf = (speciesId: number): string => POKEMON_SPECIES[speciesId - 1]?.[1] ?? `#${speciesId}`;

export type Rng = () => number;

const MOVE_POWER = 30;
const STAB = 1.5;
const CRIT_CHANCE = 1 / 16;

export const maxHpOf = (info: SpeciesBattleInfo): number => info.hp * 2 + 60;

// Um golpe: usa o melhor entre ataque e ataque especial contra a defesa correspondente, com o melhor dos tipos do atacante
// (que sempre ganha o bônus de tipo próprio), um sorteio de 85% a 100% e uma chance de acerto crítico. Nunca dá menos de 1.
export function attackDamage(attacker: SpeciesBattleInfo, defender: SpeciesBattleInfo, rng: Rng): { amount: number; multiplier: number; critical: boolean } {
  const physical = attacker.attack >= attacker.specialAttack;
  const offense = physical ? attacker.attack : attacker.specialAttack;
  const defense = physical ? defender.defense : defender.specialDefense;
  const multiplier = Math.max(...attacker.types.map((type) => effectiveness(type, defender.types)));
  const critical = rng() < CRIT_CHANCE;
  const spread = 0.85 + rng() * 0.15;
  const raw = (offense / Math.max(1, defense)) * MOVE_POWER * STAB * (multiplier === 0 ? 0.25 : multiplier) * spread * (critical ? 1.5 : 1);
  return { amount: Math.max(1, Math.round(raw)), multiplier, critical };
}

export interface BattleKnockout {
  // 'A' ou 'B': quem derrubou o adversário.
  side: 'A' | 'B';
  winner: string;
  loser: string;
  // Quanto de vida (em %) sobrou ao vencedor do duelo.
  hpLeftPercent: number;
}

export interface BattleResult {
  winner: 'A' | 'B';
  knockouts: BattleKnockout[];
  // Quantos Pokémon de cada lado ainda estavam de pé no fim.
  remainingA: number;
  remainingB: number;
}

interface Fighter {
  speciesId: number;
  name: string;
  info: SpeciesBattleInfo;
  hp: number;
  maxHp: number;
}

const toFighter = (speciesId: number): Fighter => {
  const info = battleInfoOf(speciesId);
  const maxHp = maxHpOf(info);
  return { speciesId, name: speciesNameOf(speciesId), info, hp: maxHp, maxHp };
};

// Os dois times lutam na ordem, um contra um: quem vence o duelo continua com a vida que sobrou e enfrenta o próximo. Em cada
// rodada o mais rápido ataca primeiro (empate: a sorte decide).
export function simulateBattle(teamA: readonly number[], teamB: readonly number[], rng: Rng): BattleResult {
  const a = teamA.map(toFighter);
  const b = teamB.map(toFighter);
  const knockouts: BattleKnockout[] = [];
  let ia = 0;
  let ib = 0;
  let guard = 0;
  while (ia < a.length && ib < b.length && guard < 5000) {
    guard += 1;
    const left = a[ia]!;
    const right = b[ib]!;
    const leftFirst = left.info.speed !== right.info.speed ? left.info.speed > right.info.speed : rng() < 0.5;
    const order: [Fighter, Fighter, 'A' | 'B'][] = leftFirst ? [[left, right, 'A'], [right, left, 'B']] : [[right, left, 'B'], [left, right, 'A']];
    for (const [attacker, defender, side] of order) {
      defender.hp -= attackDamage(attacker.info, defender.info, rng).amount;
      if (defender.hp <= 0) {
        knockouts.push({ side, winner: attacker.name, loser: defender.name, hpLeftPercent: Math.max(1, Math.round((attacker.hp / attacker.maxHp) * 100)) });
        if (side === 'A') ib += 1;
        else ia += 1;
        break;
      }
    }
  }
  const remainingA = Math.max(0, a.length - ia);
  const remainingB = Math.max(0, b.length - ib);
  return { winner: remainingA > 0 ? 'A' : 'B', knockouts, remainingA, remainingB };
}
