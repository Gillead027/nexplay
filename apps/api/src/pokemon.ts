import { randomUUID } from 'node:crypto';
import {
  POKEMON_BOT_DISPLAY_NAME,
  POKEMON_BOT_IDENTITY,
  POKEMON_RARITY_LABELS,
  POKEMON_SPECIES_COUNT,
  type PokemonBattle,
  type PokemonCard,
  type PokemonCardEntry,
  type PokemonInfo,
  type PokemonRarity,
  type TextMessage,
} from '@nexplay/shared';
import { db } from './db.js';
import { POKEMON_SPECIES } from './pokemonData.js';
import { POKEMON_TYPE_NAMES, battleInfoOf, simulateBattle } from './pokemonBattle.js';
import { listServerMembers } from './serverMembers.js';
import { getUserById } from './users.js';

// NexDex: o jogo de captura de Pokémon nos canais de texto. A pessoa escreve "!pokemon", aparece um Pokémon selvagem só
// para ela, e ela decide se joga uma Pokébola ("!capturar") ou deixa ir ("!fugir"). As Pokébolas vêm todo dia ("!diario"),
// os capturados formam a coleção ("!pokedex"), seis deles podem ir para o time ("!time"), "!info" mostra os tipos e
// atributos de um deles e "!batalhar" desafia outra pessoa do servidor: se ela aceitar, os dois times lutam sozinhos.

export const STARTING_BALLS = 10;
export const DAILY_BALLS = 10;
export const SPAWN_COOLDOWN_MS = 20_000;
export const SPAWN_TTL_MS = 5 * 60_000;
export const TEAM_SIZE = 6;
export const SHINY_ODDS = 1 / 512;
export const CHALLENGE_TTL_MS = 2 * 60_000;
// Quem vence uma batalha ganha Pokébolas, mas só nas primeiras batalhas do dia (para não virar uma fábrica de Pokébolas).
export const BATTLE_REWARD_BALLS = 3;
export const BATTLE_REWARDS_PER_DAY = 5;
const COLLECTION_PAGE_SIZE = 15;
const GAME_MESSAGE_KEEP_MS = 3 * 24 * 60 * 60_000;

const RARITIES: readonly PokemonRarity[] = ['comum', 'incomum', 'raro', 'lendario'];
// Chance de cada faixa aparecer, de jogar a bola e de fugir depois de uma bola que falhou (mesma ordem de RARITIES).
const SPAWN_WEIGHTS = [0.55, 0.3, 0.135, 0.015] as const;
const CATCH_CHANCE = [0.65, 0.5, 0.35, 0.15] as const;
const FLEE_CHANCE = [0.1, 0.15, 0.25, 0.4] as const;

export type Rng = () => number;

// Nos testes dá para fixar a sorte com POKEMON_FIXED_ROLL (0 a 1); fora deles é sempre Math.random.
export const defaultRng: Rng =
  process.env.NODE_ENV === 'test' && process.env.POKEMON_FIXED_ROLL !== undefined ? () => Number(process.env.POKEMON_FIXED_ROLL) : Math.random;

const speciesByTier: number[][] = RARITIES.map((_, tier) => POKEMON_SPECIES.filter((species) => species[2] === tier).map((species) => species[0]));
const nameOf = (speciesId: number): string => POKEMON_SPECIES[speciesId - 1]?.[1] ?? `#${speciesId}`;
const rarityOf = (speciesId: number): PokemonRarity => RARITIES[POKEMON_SPECIES[speciesId - 1]?.[2] ?? 0] ?? 'comum';
const tierIndex = (rarity: PokemonRarity): number => RARITIES.indexOf(rarity);

export function pickWildPokemon(rng: Rng): { speciesId: number; rarity: PokemonRarity; shiny: boolean } {
  const roll = rng();
  let tier = 0;
  let acc = 0;
  for (let index = 0; index < SPAWN_WEIGHTS.length; index += 1) {
    acc += SPAWN_WEIGHTS[index]!;
    if (roll < acc) {
      tier = index;
      break;
    }
    tier = index;
  }
  const pool = speciesByTier[tier]!;
  const speciesId = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!;
  return { speciesId, rarity: RARITIES[tier]!, shiny: rng() < SHINY_ODDS };
}

export const catchChanceOf = (rarity: PokemonRarity): number => CATCH_CHANCE[tierIndex(rarity)] ?? 0.5;
export const fleeChanceOf = (rarity: PokemonRarity): number => FLEE_CHANCE[tierIndex(rarity)] ?? 0.1;

// A data (AAAA-MM-DD) no horário de Brasília: as Pokébolas do dia viram à meia-noite de lá.
export function brasiliaDate(now: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

// ---------------------------------------------------------------- comandos

const COMMAND_ALIASES: Record<string, string> = {
  pokemon: 'pokemon',
  pokémon: 'pokemon',
  poke: 'pokemon',
  capturar: 'capturar',
  catch: 'capturar',
  pegar: 'capturar',
  fugir: 'fugir',
  flee: 'fugir',
  ignorar: 'fugir',
  diario: 'diario',
  diária: 'diario',
  diaria: 'diario',
  daily: 'diario',
  bolas: 'bolas',
  pokebolas: 'bolas',
  balls: 'bolas',
  pokedex: 'pokedex',
  colecao: 'pokedex',
  coleção: 'pokedex',
  meus: 'pokedex',
  time: 'time',
  team: 'time',
  info: 'info',
  ficha: 'info',
  batalhar: 'batalhar',
  batalha: 'batalhar',
  duelo: 'batalhar',
  desafiar: 'batalhar',
  battle: 'batalhar',
  aceitar: 'aceitar',
  accept: 'aceitar',
  recusar: 'recusar',
  decline: 'recusar',
  pokeajuda: 'ajuda',
  pokehelp: 'ajuda',
};

export function parsePokemonCommand(text: string): { command: string; args: string[] } | null {
  const match = /^!([^\s]+)(?:\s+(.*))?$/i.exec(text.trim());
  const command = match?.[1] ? COMMAND_ALIASES[match[1].toLowerCase()] : undefined;
  if (!command) return null;
  return { command, args: (match?.[2] ?? '').trim().split(/\s+/).filter(Boolean) };
}

export const isPokemonCommand = (text: string): boolean => parsePokemonCommand(text) !== null;

// ---------------------------------------------------------------- banco

interface PlayerRow { user_id: string; balls: number; last_daily: string; last_spawn_at: number }
interface SpawnRow { user_id: string; server_id: string; channel_id: string; message_id: string; species_id: number; shiny: number; spawned_at: number; attempts: number }
interface CaughtRow { id: string; user_id: string; no: number; species_id: number; shiny: number; caught_at: number }
interface GameMessageRow { id: string; channel_id: string; text: string; card_json: string; created_at: number }
interface ChallengeRow { challenger_id: string; opponent_id: string; server_id: string; channel_id: string; message_id: string; created_at: number }

const selectPlayer = db.prepare('SELECT * FROM pokemon_players WHERE user_id = ?');
const insertPlayer = db.prepare('INSERT INTO pokemon_players (user_id, balls, last_daily, last_spawn_at, created_at) VALUES (?, ?, ?, 0, ?)');
const updateBalls = db.prepare('UPDATE pokemon_players SET balls = ? WHERE user_id = ?');
const updateDaily = db.prepare('UPDATE pokemon_players SET balls = balls + ?, last_daily = ? WHERE user_id = ?');
const updateLastSpawn = db.prepare('UPDATE pokemon_players SET last_spawn_at = ? WHERE user_id = ?');
const selectSpawn = db.prepare('SELECT * FROM pokemon_spawns WHERE user_id = ?');
const upsertSpawn = db.prepare(`
  INSERT INTO pokemon_spawns (user_id, server_id, channel_id, message_id, species_id, shiny, spawned_at, attempts) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  ON CONFLICT(user_id) DO UPDATE SET server_id = excluded.server_id, channel_id = excluded.channel_id, message_id = excluded.message_id,
    species_id = excluded.species_id, shiny = excluded.shiny, spawned_at = excluded.spawned_at, attempts = 0
`);
const bumpAttempts = db.prepare('UPDATE pokemon_spawns SET attempts = attempts + 1 WHERE user_id = ?');
const deleteSpawn = db.prepare('DELETE FROM pokemon_spawns WHERE user_id = ?');
const selectMaxNo = db.prepare('SELECT COALESCE(MAX(no), 0) AS max FROM pokemon_caught WHERE user_id = ?');
const insertCaught = db.prepare('INSERT INTO pokemon_caught (id, user_id, no, species_id, shiny, caught_at) VALUES (?, ?, ?, ?, ?, ?)');
const selectCaughtByNo = db.prepare('SELECT * FROM pokemon_caught WHERE user_id = ? AND no = ?');
const listCaughtPage = db.prepare('SELECT * FROM pokemon_caught WHERE user_id = ? ORDER BY no ASC LIMIT ? OFFSET ?');
const countCaught = db.prepare('SELECT COUNT(*) AS total, COUNT(DISTINCT species_id) AS species FROM pokemon_caught WHERE user_id = ?');
const listTeam = db.prepare(`
  SELECT pokemon_caught.* FROM pokemon_team INNER JOIN pokemon_caught ON pokemon_caught.id = pokemon_team.caught_id
  WHERE pokemon_team.user_id = ? ORDER BY pokemon_team.slot ASC
`);
const teamSlots = db.prepare('SELECT slot FROM pokemon_team WHERE user_id = ? ORDER BY slot ASC');
const teamHas = db.prepare('SELECT 1 AS ok FROM pokemon_team WHERE caught_id = ?');
const insertTeam = db.prepare('INSERT INTO pokemon_team (user_id, slot, caught_id) VALUES (?, ?, ?)');
const deleteTeamByCaught = db.prepare('DELETE FROM pokemon_team WHERE user_id = ? AND caught_id = ?');
const deleteTeam = db.prepare('DELETE FROM pokemon_team WHERE user_id = ?');
const insertGameMessage = db.prepare('INSERT INTO text_game_messages (id, channel_id, text, card_json, created_at) VALUES (?, ?, ?, ?, ?)');
const selectGameMessage = db.prepare('SELECT * FROM text_game_messages WHERE id = ?');
const updateGameMessage = db.prepare('UPDATE text_game_messages SET text = ?, card_json = ? WHERE id = ?');
const listGameMessagesStatement = db.prepare('SELECT * FROM text_game_messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT ?');
const pruneGameMessages = db.prepare('DELETE FROM text_game_messages WHERE channel_id = ? AND created_at < ?');
const selectLastCaught = db.prepare('SELECT * FROM pokemon_caught WHERE user_id = ? ORDER BY no DESC LIMIT 1');
const selectChallengeByChallenger = db.prepare('SELECT * FROM pokemon_challenges WHERE challenger_id = ?');
const selectChallengeByOpponent = db.prepare('SELECT * FROM pokemon_challenges WHERE opponent_id = ? ORDER BY created_at DESC LIMIT 1');
const upsertChallenge = db.prepare(`
  INSERT INTO pokemon_challenges (challenger_id, opponent_id, server_id, channel_id, message_id, created_at) VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(challenger_id) DO UPDATE SET opponent_id = excluded.opponent_id, server_id = excluded.server_id,
    channel_id = excluded.channel_id, message_id = excluded.message_id, created_at = excluded.created_at
`);
const deleteChallenge = db.prepare('DELETE FROM pokemon_challenges WHERE challenger_id = ?');
const selectRewards = db.prepare('SELECT reward_date, rewards_today FROM pokemon_players WHERE user_id = ?');
const recordWin = db.prepare('UPDATE pokemon_players SET battle_wins = battle_wins + 1, balls = balls + ?, reward_date = ?, rewards_today = ? WHERE user_id = ?');
const recordLoss = db.prepare('UPDATE pokemon_players SET battle_losses = battle_losses + 1 WHERE user_id = ?');
const selectRecord = db.prepare('SELECT battle_wins, battle_losses FROM pokemon_players WHERE user_id = ?');

function ensurePlayer(userId: string, now: number): PlayerRow {
  const existing = selectPlayer.get(userId) as unknown as PlayerRow | undefined;
  if (existing) return existing;
  insertPlayer.run(userId, STARTING_BALLS, '', now);
  return selectPlayer.get(userId) as unknown as PlayerRow;
}

// ---------------------------------------------------------------- mensagens do NexDex

function toGameMessage(row: GameMessageRow): TextMessage {
  let pokemonCard: PokemonCard | undefined;
  try {
    pokemonCard = row.card_json ? (JSON.parse(row.card_json) as PokemonCard) : undefined;
  } catch {
    pokemonCard = undefined;
  }
  return {
    id: row.id,
    channelId: row.channel_id,
    senderId: POKEMON_BOT_IDENTITY,
    senderName: POKEMON_BOT_DISPLAY_NAME,
    senderType: 'GAME',
    text: row.text,
    sentAt: row.created_at,
    ...(pokemonCard ? { pokemonCard } : {}),
  };
}

export function listGameMessages(channelId: string, limit: number): TextMessage[] {
  return (listGameMessagesStatement.all(channelId, limit) as unknown as GameMessageRow[]).map(toGameMessage);
}

function postGameMessage(channelId: string, text: string, card: PokemonCard | null, now: number): TextMessage {
  const id = `game:${randomUUID()}`;
  insertGameMessage.run(id, channelId, text, card ? JSON.stringify(card) : '', now);
  pruneGameMessages.run(channelId, now - GAME_MESSAGE_KEEP_MS);
  return toGameMessage(selectGameMessage.get(id) as unknown as GameMessageRow);
}

function setCardStatus(messageId: string, status: NonNullable<PokemonCard['status']>): TextMessage | null {
  const row = selectGameMessage.get(messageId) as unknown as GameMessageRow | undefined;
  if (!row) return null;
  const card = JSON.parse(row.card_json) as PokemonCard;
  card.status = status;
  updateGameMessage.run(row.text, JSON.stringify(card), messageId);
  return toGameMessage({ ...row, card_json: JSON.stringify(card) });
}

const entryOf = (speciesId: number, shiny: boolean, no?: number): PokemonCardEntry => ({
  speciesId,
  name: nameOf(speciesId),
  rarity: rarityOf(speciesId),
  shiny,
  ...(no !== undefined ? { no } : {}),
});

const label = (entry: PokemonCardEntry): string => `${entry.shiny ? '✨ ' : ''}**${entry.name}**`;

const infoOf = (speciesId: number): PokemonInfo => {
  const battle = battleInfoOf(speciesId);
  const stats = { hp: battle.hp, attack: battle.attack, defense: battle.defense, specialAttack: battle.specialAttack, specialDefense: battle.specialDefense, speed: battle.speed };
  return { types: battle.types.map((type) => POKEMON_TYPE_NAMES[type] ?? 'Normal'), stats, total: Object.values(stats).reduce((sum, value) => sum + value, 0) };
};

// Tira acentos e caixa para achar "pikachu" ou "Charmeleão" mesmo digitado sem til.
const plain = (text: string): string => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const speciesByPlainName = new Map(POKEMON_SPECIES.map((species) => [plain(species[1]), species[0]] as const));

const teamEntriesOf = (userId: string): PokemonCardEntry[] =>
  (listTeam.all(userId) as unknown as CaughtRow[]).map((row) => entryOf(row.species_id, Boolean(row.shiny), row.no));

// ---------------------------------------------------------------- jogo

export interface GameReply {
  kind: 'create' | 'upsert';
  message: TextMessage;
  // O servidor a que a mensagem pertence (um cartão antigo pode ser de outro servidor que não o do comando).
  serverId: string;
}

export interface GameInput {
  user: { id: string; username: string };
  serverId: string;
  channelId: string;
  text: string;
  now: number;
  rng: Rng;
}

const HELP_TEXT = [
  '**NexDex — captura de Pokémon**',
  '`!pokemon` procura um Pokémon selvagem · `!capturar` joga uma Pokébola · `!fugir` deixa ele ir embora',
  '`!diario` resgata as Pokébolas do dia · `!bolas` mostra quantas você tem',
  '`!pokedex` lista o que você já capturou · `!time` mostra o seu time; `!time adicionar 3` e `!time remover 3` (até 6)',
  '`!info 3` mostra os tipos e atributos do Pokémon #3 da sua coleção (ou de qualquer espécie: `!info pikachu`)',
  `\`!batalhar nome\` desafia alguém do servidor para uma batalha de times · \`!aceitar\` e \`!recusar\` respondem a um desafio (quem vence ganha ${BATTLE_REWARD_BALLS} Pokébolas, até ${BATTLE_REWARDS_PER_DAY} vitórias por dia)`,
].join('\n');

export function handlePokemonCommand(input: GameInput): GameReply[] {
  const parsed = parsePokemonCommand(input.text);
  if (!parsed) return [];
  const { user, channelId, now, rng } = input;
  const replies: GameReply[] = [];
  const say = (text: string, card: PokemonCard | null = null): TextMessage => {
    const message = postGameMessage(channelId, text, card, now);
    replies.push({ kind: 'create', message, serverId: input.serverId });
    return message;
  };
  const upsert = (message: TextMessage | null, serverId: string): void => {
    if (message) replies.push({ kind: 'upsert', message, serverId });
  };
  const player = ensurePlayer(user.id, now);

  switch (parsed.command) {
    case 'ajuda':
      say(HELP_TEXT);
      break;

    case 'bolas': {
      const daily = player.last_daily === brasiliaDate(now) ? 'As de hoje você já resgatou.' : 'Você ainda tem as Pokébolas de hoje para resgatar com `!diario`.';
      say(`Você tem **${player.balls}** Pokébola${player.balls === 1 ? '' : 's'}. ${daily}`);
      break;
    }

    case 'diario': {
      const today = brasiliaDate(now);
      if (player.last_daily === today) {
        say(`Você já resgatou as Pokébolas de hoje. Volte amanhã (a partir da meia-noite de Brasília)! Você tem **${player.balls}**.`);
      } else {
        updateDaily.run(DAILY_BALLS, today, user.id);
        say(`Você resgatou **${DAILY_BALLS}** Pokébolas do dia! Agora tem **${player.balls + DAILY_BALLS}**.`);
      }
      break;
    }

    case 'pokemon': {
      const wait = player.last_spawn_at + SPAWN_COOLDOWN_MS - now;
      if (wait > 0) {
        say(`Calma, treinador! Espere mais ${Math.ceil(wait / 1000)} segundos para procurar outro Pokémon.`);
        break;
      }
      const open = selectSpawn.get(user.id) as unknown as SpawnRow | undefined;
      if (open) {
        if (now - open.spawned_at < SPAWN_TTL_MS) {
          say(`Você já tem um **${nameOf(open.species_id)}** selvagem te esperando! Use \`!capturar\` ou \`!fugir\`.`);
          break;
        }
        const expired = setCardStatus(open.message_id, 'expired');
        upsert(expired, open.server_id);
        deleteSpawn.run(user.id);
      }
      const wild = pickWildPokemon(rng);
      const entry = entryOf(wild.speciesId, wild.shiny);
      const legendary = wild.rarity === 'lendario';
      const intro = legendary
        ? `${entry.shiny ? '✨ ' : ''}Um **${entry.name}** LENDÁRIO apareceu para **${user.username}**!`
        : `Um ${label(entry)} selvagem apareceu para **${user.username}**!`;
      const message = say(`${intro} Use \`!capturar\` (ou o botão) para jogar uma Pokébola, ou \`!fugir\`.`, {
        kind: 'wild',
        status: 'wild',
        ownerId: user.id,
        ownerName: user.username,
        title: legendary ? 'Pokémon lendário!' : 'Pokémon selvagem',
        entries: [entry],
        balls: player.balls,
      });
      upsertSpawn.run(user.id, input.serverId, channelId, message.id, wild.speciesId, Number(wild.shiny), now);
      updateLastSpawn.run(now, user.id);
      break;
    }

    case 'fugir': {
      const open = selectSpawn.get(user.id) as unknown as SpawnRow | undefined;
      if (!open) {
        say('Você não tem nenhum Pokémon selvagem por perto. Use `!pokemon` para procurar um.');
        break;
      }
      const fled = setCardStatus(open.message_id, 'fled');
      upsert(fled, open.server_id);
      deleteSpawn.run(user.id);
      say(`Você deixou o **${nameOf(open.species_id)}** ir embora.`);
      break;
    }

    case 'capturar': {
      const open = selectSpawn.get(user.id) as unknown as SpawnRow | undefined;
      if (!open) {
        say('Você não tem nenhum Pokémon selvagem por perto. Use `!pokemon` para procurar um.');
        break;
      }
      if (now - open.spawned_at >= SPAWN_TTL_MS) {
        const expired = setCardStatus(open.message_id, 'expired');
        upsert(expired, open.server_id);
        deleteSpawn.run(user.id);
        say(`O **${nameOf(open.species_id)}** foi embora enquanto você pensava. Use \`!pokemon\` para procurar outro.`);
        break;
      }
      if (player.balls < 1) {
        say('Você está sem Pokébolas! Resgate as do dia com `!diario` (uma vez por dia) e volte aqui.');
        break;
      }
      const balls = player.balls - 1;
      updateBalls.run(balls, user.id);
      const entry = entryOf(open.species_id, Boolean(open.shiny));
      if (rng() < catchChanceOf(entry.rarity)) {
        const no = (selectMaxNo.get(user.id) as unknown as { max: number }).max + 1;
        insertCaught.run(randomUUID(), user.id, no, open.species_id, open.shiny, now);
        deleteSpawn.run(user.id);
        const caught = setCardStatus(open.message_id, 'caught');
        upsert(caught, open.server_id);
        say(`Gotcha! **${user.username}** capturou ${label(entry)}! Ele é o Pokémon **#${no}** da sua coleção. Pokébolas: **${balls}**.`, {
          kind: 'caught',
          ownerId: user.id,
          ownerName: user.username,
          title: 'Capturado!',
          entries: [{ ...entry, no }],
          balls,
        });
      } else if (rng() < fleeChanceOf(entry.rarity)) {
        deleteSpawn.run(user.id);
        const fled = setCardStatus(open.message_id, 'fled');
        upsert(fled, open.server_id);
        say(`A Pokébola falhou e o ${label(entry)} fugiu! Pokébolas: **${balls}**.`);
      } else {
        bumpAttempts.run(user.id);
        say(`A Pokébola falhou! O ${label(entry)} ainda está aqui. Pokébolas: **${balls}**.`);
      }
      break;
    }

    case 'pokedex': {
      const totals = countCaught.get(user.id) as unknown as { total: number; species: number };
      if (totals.total === 0) {
        say('Sua coleção ainda está vazia. Use `!pokemon` para procurar seu primeiro Pokémon!');
        break;
      }
      const pages = Math.ceil(totals.total / COLLECTION_PAGE_SIZE);
      const page = Math.min(pages, Math.max(1, Number.parseInt(parsed.args[0] ?? '1', 10) || 1));
      const rows = listCaughtPage.all(user.id, COLLECTION_PAGE_SIZE, (page - 1) * COLLECTION_PAGE_SIZE) as unknown as CaughtRow[];
      const lines = rows.map((row) => {
        const entry = entryOf(row.species_id, Boolean(row.shiny), row.no);
        return `**#${row.no}** ${entry.shiny ? '✨ ' : ''}${entry.name} · ${POKEMON_RARITY_LABELS[entry.rarity]}`;
      });
      say(
        `**Pokédex de ${user.username}** — ${totals.total} capturado${totals.total === 1 ? '' : 's'}, ${totals.species} espécie${totals.species === 1 ? '' : 's'} diferente${totals.species === 1 ? '' : 's'} (de ${POKEMON_SPECIES_COUNT}). Página ${page} de ${pages}${pages > 1 ? ' — `!pokedex 2` mostra a próxima' : ''}.\n${lines.join('\n')}`,
      );
      break;
    }

    case 'time': {
      const [action, numberText] = parsed.args;
      const teamCard = (): PokemonCard => ({
        kind: 'team',
        ownerId: user.id,
        ownerName: user.username,
        title: `Time de ${user.username}`,
        entries: (listTeam.all(user.id) as unknown as CaughtRow[]).map((row) => entryOf(row.species_id, Boolean(row.shiny), row.no)),
      });
      const sub = action?.toLowerCase();
      if (sub === 'adicionar' || sub === 'add') {
        const no = Number.parseInt(numberText ?? '', 10);
        const caught = Number.isFinite(no) ? (selectCaughtByNo.get(user.id, no) as unknown as CaughtRow | undefined) : undefined;
        if (!caught) {
          say('Informe o número de um Pokémon da sua coleção, por exemplo `!time adicionar 3` (veja os números com `!pokedex`).');
          break;
        }
        if (teamHas.get(caught.id)) {
          say(`O **${nameOf(caught.species_id)}** #${caught.no} já está no seu time.`);
          break;
        }
        const used = new Set((teamSlots.all(user.id) as unknown as { slot: number }[]).map((row) => row.slot));
        const free = Array.from({ length: TEAM_SIZE }, (_, index) => index + 1).find((slot) => !used.has(slot));
        if (!free) {
          say(`Seu time já tem ${TEAM_SIZE} Pokémon. Tire um com \`!time remover <número>\` antes.`);
          break;
        }
        insertTeam.run(user.id, free, caught.id);
        say(`**${nameOf(caught.species_id)}** entrou no time!`, teamCard());
      } else if (sub === 'remover' || sub === 'remove') {
        const no = Number.parseInt(numberText ?? '', 10);
        const caught = Number.isFinite(no) ? (selectCaughtByNo.get(user.id, no) as unknown as CaughtRow | undefined) : undefined;
        if (!caught || !teamHas.get(caught.id)) {
          say('Esse Pokémon não está no seu time. Veja o time com `!time`.');
          break;
        }
        deleteTeamByCaught.run(user.id, caught.id);
        say(`**${nameOf(caught.species_id)}** saiu do time.`, teamCard());
      } else if (sub === 'limpar') {
        deleteTeam.run(user.id);
        say('Seu time foi esvaziado.');
      } else {
        const card = teamCard();
        if (card.entries.length === 0) say('Seu time está vazio. Capture Pokémon com `!pokemon` e monte o time com `!time adicionar <número>`.');
        else say(`Este é o time de **${user.username}**.`, card);
      }
      break;
    }

    case 'info': {
      // Sem nada: o último capturado. Um número: o da sua coleção. Um nome: a espécie (mesmo que você ainda não a tenha).
      const query = parsed.args.join(' ').replace(/^#/, '');
      let target: { speciesId: number; shiny: boolean; no?: number } | null = null;
      if (!query || /^\d+$/.test(query)) {
        const owned = (query ? selectCaughtByNo.get(user.id, Number(query)) : selectLastCaught.get(user.id)) as unknown as CaughtRow | undefined;
        if (owned) target = { speciesId: owned.species_id, shiny: Boolean(owned.shiny), no: owned.no };
      } else {
        const speciesId = speciesByPlainName.get(plain(query));
        if (speciesId) target = { speciesId, shiny: false };
      }
      if (!target) {
        say('Não encontrei esse Pokémon. Use o número da sua coleção (`!info 3`, veja os números com `!pokedex`) ou o nome de uma espécie (`!info pikachu`).');
        break;
      }
      const entry = entryOf(target.speciesId, target.shiny, target.no);
      const info = infoOf(target.speciesId);
      say(`${label(entry)} — tipo ${info.types.join(' / ')}.`, {
        kind: 'info',
        ownerId: user.id,
        ownerName: user.username,
        title: target.no !== undefined ? `#${target.no} na coleção de ${user.username}` : 'Ficha da espécie',
        entries: [entry],
        info,
      });
      break;
    }

    case 'batalhar': {
      const wanted = parsed.args.join(' ').replace(/^@/, '').trim().toLowerCase();
      if (!wanted) {
        say('Diga quem você quer desafiar, por exemplo `!batalhar Ash`. Vocês dois precisam ter um time (`!time adicionar <número>`).');
        break;
      }
      const opponent = listServerMembers(input.serverId).find((member) => member.displayName.toLowerCase() === wanted);
      if (!opponent) {
        say('Não encontrei esse membro neste servidor. Escreva o nome como aparece na lista de membros.');
        break;
      }
      if (opponent.id === user.id) {
        say('Você não pode desafiar a si mesmo!');
        break;
      }
      const teamA = teamEntriesOf(user.id);
      if (teamA.length === 0) {
        say('Você precisa de um time para batalhar. Capture Pokémon e monte o time com `!time adicionar <número>`.');
        break;
      }
      const teamB = teamEntriesOf(opponent.id);
      if (teamB.length === 0) {
        say(`**${opponent.displayName}** ainda não montou um time, então não dá para batalhar.`);
        break;
      }
      // Cada pessoa só tem um desafio aberto por vez: o novo cancela o anterior.
      const previous = selectChallengeByChallenger.get(user.id) as unknown as ChallengeRow | undefined;
      if (previous) upsert(setCardStatus(previous.message_id, 'expired'), previous.server_id);
      const battle: PokemonBattle = {
        challengerId: user.id,
        challengerName: user.username,
        opponentId: opponent.id,
        opponentName: opponent.displayName,
        teamA,
        teamB,
      };
      const message = say(
        `**${user.username}** desafiou **${opponent.displayName}** para uma batalha de times! **${opponent.displayName}**, use \`!aceitar\` (ou o botão) ou \`!recusar\`. O desafio vale por ${CHALLENGE_TTL_MS / 60_000} minutos.`,
        { kind: 'challenge', status: 'pending', ownerId: user.id, ownerName: user.username, title: 'Desafio de batalha', entries: [], battle },
      );
      upsertChallenge.run(user.id, opponent.id, input.serverId, channelId, message.id, now);
      break;
    }

    case 'aceitar':
    case 'recusar': {
      const accepting = parsed.command === 'aceitar';
      const challenge = selectChallengeByOpponent.get(user.id) as unknown as ChallengeRow | undefined;
      if (!challenge && !accepting) {
        // Quem desafiou também pode desistir do próprio desafio com "!recusar".
        const own = selectChallengeByChallenger.get(user.id) as unknown as ChallengeRow | undefined;
        if (own) {
          deleteChallenge.run(user.id);
          upsert(setCardStatus(own.message_id, 'declined'), own.server_id);
          say('Você cancelou o seu desafio.');
          break;
        }
      }
      if (!challenge) {
        say('Ninguém desafiou você para uma batalha. Use `!batalhar nome` para desafiar alguém.');
        break;
      }
      if (now - challenge.created_at >= CHALLENGE_TTL_MS) {
        deleteChallenge.run(challenge.challenger_id);
        upsert(setCardStatus(challenge.message_id, 'expired'), challenge.server_id);
        say('Esse desafio já venceu. Peça para a pessoa desafiar de novo com `!batalhar`.');
        break;
      }
      if (challenge.server_id !== input.serverId) {
        say('Esse desafio foi feito em outro servidor: responda por lá.');
        break;
      }
      const challengerName = getUserById(challenge.challenger_id)?.username ?? 'Treinador';
      if (!accepting) {
        deleteChallenge.run(challenge.challenger_id);
        upsert(setCardStatus(challenge.message_id, 'declined'), challenge.server_id);
        say(`**${user.username}** recusou o desafio de **${challengerName}**.`);
        break;
      }

      // Os times valem os de agora, não os de quando o desafio foi feito.
      const rowsA = listTeam.all(challenge.challenger_id) as unknown as CaughtRow[];
      const rowsB = listTeam.all(user.id) as unknown as CaughtRow[];
      deleteChallenge.run(challenge.challenger_id);
      if (rowsA.length === 0 || rowsB.length === 0) {
        upsert(setCardStatus(challenge.message_id, 'declined'), challenge.server_id);
        say('A batalha foi cancelada: um dos dois ficou sem time.');
        break;
      }
      const entriesOf = (rows: CaughtRow[]): PokemonCardEntry[] => rows.map((row) => entryOf(row.species_id, Boolean(row.shiny), row.no));
      const result = simulateBattle(rowsA.map((row) => row.species_id), rowsB.map((row) => row.species_id), rng);
      const challengerWon = result.winner === 'A';
      const winner = challengerWon ? { id: challenge.challenger_id, name: challengerName } : { id: user.id, name: user.username };
      const loser = challengerWon ? { id: user.id, name: user.username } : { id: challenge.challenger_id, name: challengerName };

      ensurePlayer(winner.id, now);
      const today = brasiliaDate(now);
      const rewardRow = selectRewards.get(winner.id) as unknown as { reward_date: string; rewards_today: number };
      const rewardsUsed = rewardRow.reward_date === today ? rewardRow.rewards_today : 0;
      const reward = rewardsUsed < BATTLE_REWARDS_PER_DAY ? BATTLE_REWARD_BALLS : 0;
      recordWin.run(reward, today, rewardsUsed + (reward > 0 ? 1 : 0), winner.id);
      ensurePlayer(loser.id, now);
      recordLoss.run(loser.id);
      const record = selectRecord.get(winner.id) as unknown as { battle_wins: number; battle_losses: number };

      upsert(setCardStatus(challenge.message_id, 'accepted'), challenge.server_id);
      const rewardText = reward > 0 ? `Ganhou **${reward}** Pokébolas!` : 'As Pokébolas de batalha de hoje já foram todas ganhas.';
      say(
        `**${winner.name}** venceu **${loser.name}** na batalha! ${rewardText} (${record.battle_wins} vitória${record.battle_wins === 1 ? '' : 's'} e ${record.battle_losses} derrota${record.battle_losses === 1 ? '' : 's'} de ${winner.name}.)`,
        {
          kind: 'battle',
          ownerId: winner.id,
          ownerName: winner.name,
          title: 'Resultado da batalha',
          entries: [],
          battle: {
            challengerId: challenge.challenger_id,
            challengerName,
            opponentId: user.id,
            opponentName: user.username,
            teamA: entriesOf(rowsA),
            teamB: entriesOf(rowsB),
            winnerId: winner.id,
            winnerName: winner.name,
            lines: result.knockouts,
            reward,
          },
        },
      );
      break;
    }
  }
  return replies;
}
