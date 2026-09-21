import { randomUUID } from 'node:crypto';
import {
  POKEMON_BOT_DISPLAY_NAME,
  POKEMON_BOT_IDENTITY,
  POKEMON_RARITY_LABELS,
  POKEMON_SPECIES_COUNT,
  type PokemonCard,
  type PokemonCardEntry,
  type PokemonRarity,
  type TextMessage,
} from '@nexplay/shared';
import { db } from './db.js';
import { POKEMON_SPECIES } from './pokemonData.js';

// NexDex: o jogo de captura de Pokémon nos canais de texto. A pessoa escreve "!pokemon", aparece um Pokémon selvagem só
// para ela, e ela decide se joga uma Pokébola ("!capturar") ou deixa ir ("!fugir"). As Pokébolas vêm todo dia ("!diario"),
// os capturados formam a coleção ("!pokedex") e seis deles podem ir para o time ("!time").

export const STARTING_BALLS = 10;
export const DAILY_BALLS = 10;
export const SPAWN_COOLDOWN_MS = 20_000;
export const SPAWN_TTL_MS = 5 * 60_000;
export const TEAM_SIZE = 6;
export const SHINY_ODDS = 1 / 512;
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

function setWildStatus(messageId: string, status: NonNullable<PokemonCard['status']>): TextMessage | null {
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

// ---------------------------------------------------------------- jogo

export interface GameReply {
  kind: 'create' | 'upsert';
  message: TextMessage;
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
].join('\n');

export function handlePokemonCommand(input: GameInput): GameReply[] {
  const parsed = parsePokemonCommand(input.text);
  if (!parsed) return [];
  const { user, channelId, now, rng } = input;
  const replies: GameReply[] = [];
  const say = (text: string, card: PokemonCard | null = null): TextMessage => {
    const message = postGameMessage(channelId, text, card, now);
    replies.push({ kind: 'create', message });
    return message;
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
        const expired = setWildStatus(open.message_id, 'expired');
        if (expired) replies.push({ kind: 'upsert', message: expired });
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
      const fled = setWildStatus(open.message_id, 'fled');
      if (fled) replies.push({ kind: 'upsert', message: fled });
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
        const expired = setWildStatus(open.message_id, 'expired');
        if (expired) replies.push({ kind: 'upsert', message: expired });
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
        const caught = setWildStatus(open.message_id, 'caught');
        if (caught) replies.push({ kind: 'upsert', message: caught });
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
        const fled = setWildStatus(open.message_id, 'fled');
        if (fled) replies.push({ kind: 'upsert', message: fled });
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
  }
  return replies;
}
