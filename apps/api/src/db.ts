import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_EVERYONE_PERMISSIONS, Permission } from '@nexplay/shared';
import { config } from './config.js';

mkdirSync(dirname(config.DB_PATH), { recursive: true });

export const db = new DatabaseSync(config.DB_PATH);

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    accent_color TEXT NOT NULL,
    status_text TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS text_channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS text_messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES text_channels(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_text_messages_channel_created
    ON text_messages(channel_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS text_bot_messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES text_channels(id) ON DELETE CASCADE,
    sender_name TEXT NOT NULL,
    text TEXT NOT NULL,
    music_card_json TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_text_bot_messages_channel_created
    ON text_bot_messages(channel_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS voice_channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS message_reactions (
    message_id TEXT NOT NULL REFERENCES text_messages(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (message_id, emoji, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_message_reactions_message
    ON message_reactions(message_id);

  CREATE TABLE IF NOT EXISTS soundboard_sounds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL,
    audio_data_url TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    color TEXT NOT NULL,
    position INTEGER NOT NULL,
    hoist INTEGER NOT NULL DEFAULT 0,
    permissions INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_roles (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, role_id)
  );

  CREATE TABLE IF NOT EXISTS bans (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL DEFAULT '',
    banned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );

  -- message_id começa NULL (upload "pendente", ainda não anexado a uma
  -- mensagem enviada) e é preenchido quando a mensagem é criada — permite o
  -- cliente pré-visualizar o arquivo antes de enviar o texto. channel_id fica
  -- guardado à parte pra validar, no momento de anexar, que o upload
  -- pendente pertence ao mesmo canal da mensagem (e ao mesmo usuário).
  CREATE TABLE IF NOT EXISTS message_attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT REFERENCES text_messages(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL REFERENCES text_channels(id) ON DELETE CASCADE,
    object_key TEXT NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_message_attachments_message
    ON message_attachments(message_id);

  -- Uma linha por par (sempre user_id_a < user_id_b, ordem de string) evita
  -- duplicar A-B/B-A. requested_by distingue PENDING_INCOMING de
  -- PENDING_OUTGOING do ponto de vista de cada usuário (ver friendships.ts).
  CREATE TABLE IF NOT EXISTS friendships (
    user_id_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED')),
    requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    responded_at INTEGER,
    PRIMARY KEY (user_id_a, user_id_b),
    CHECK (user_id_a < user_id_b)
  );

  CREATE INDEX IF NOT EXISTS idx_friendships_user_b ON friendships(user_id_b);

  -- Direcional de propósito (bloquear não é simétrico) — sem ordenação canônica.
  CREATE TABLE IF NOT EXISTS blocks (
    blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id)
  );

  CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);

  CREATE TABLE IF NOT EXISTS dm_channels (
    id TEXT PRIMARY KEY,
    user_id_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    last_message_at INTEGER,
    CHECK (user_id_a < user_id_b),
    UNIQUE (user_id_a, user_id_b)
  );

  CREATE INDEX IF NOT EXISTS idx_dm_channels_user_b ON dm_channels(user_id_b);

  CREATE TABLE IF NOT EXISTS dm_messages (
    id TEXT PRIMARY KEY,
    dm_channel_id TEXT NOT NULL REFERENCES dm_channels(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    edited_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_dm_messages_channel_created
    ON dm_messages(dm_channel_id, created_at DESC);

  -- owner_id fica nullable (não "quem excluiu perde o servidor" — só não há
  -- ninguém ainda pra ser dono num banco recém-criado, antes do primeiro
  -- registro). ON DELETE SET NULL, não CASCADE: excluir uma conta não deveria
  -- apagar um servidor inteiro (mesmo padrão de text_channels.created_by).
  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon_data_url TEXT NOT NULL DEFAULT '',
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS server_members (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL,
    timeout_until INTEGER,
    PRIMARY KEY (server_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id);

  -- code é a própria PK (um único convite regenerável por servidor nesta
  -- rodada — ver DISCORD_PARITY_PLAN.md). max_uses/expires_at ficam sempre
  -- NULL por enquanto, mas o schema já suporta os dois sem nova migração.
  CREATE TABLE IF NOT EXISTS invites (
    code TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    max_uses INTEGER,
    uses INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_invites_server ON invites(server_id);

  -- staff_only: categoria só listada pra membros com alguma permissão além
  -- do @everyone padrão (ver isStaffTier em roles.ts) — reaproveita o
  -- bitfield de cargos já existente em vez de inventar um segundo sistema de
  -- visibilidade por canal/categoria (ver nota em Permission, packages/shared).
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    staff_only INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_categories_server ON categories(server_id);

  -- Preferência por usuário+categoria: recolhida (UI) e modo de notificação
  -- ("Silenciar categoria" é só notification_mode = 'none'). Sem "marcar como
  -- lida" aqui de propósito — o app ainda não tem nenhum rastreio de
  -- mensagem lida/não lida em lugar nenhum (nem em canal avulso), então
  -- persistir isso só pra este menu seria um dado morto sem nenhuma UI que o
  -- leia de volta (ver DISCORD_PARITY_PLAN.md).
  CREATE TABLE IF NOT EXISTS category_prefs (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    collapsed INTEGER NOT NULL DEFAULT 0,
    notification_mode TEXT NOT NULL DEFAULT 'all' CHECK (notification_mode IN ('all', 'mentions', 'none')),
    PRIMARY KEY (user_id, category_id)
  );

  -- Webhook de canal: qualquer serviço externo que souber id+token pode
  -- postar mensagem nesse canal sem conta no NexPlay (ver textChannels via
  -- webhooks.ts). token é único globalmente (a rota pública de post só
  -- recebe /api/webhooks/:id/:token, sem sessão).
  CREATE TABLE IF NOT EXISTS text_webhooks (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES text_channels(id) ON DELETE CASCADE,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    avatar_url TEXT NOT NULL DEFAULT '',
    token TEXT NOT NULL UNIQUE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_text_webhooks_channel ON text_webhooks(channel_id);

  -- Mensagens postadas por um webhook — tabela separada de text_messages
  -- porque sender_id ali é NOT NULL REFERENCES users(id) e um webhook não é
  -- um usuário (mesmo padrão de text_bot_messages, mas sem o limite de uma
  -- linha por canal: um canal pode ter muitas mensagens de webhook).
  CREATE TABLE IF NOT EXISTS text_webhook_messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES text_channels(id) ON DELETE CASCADE,
    webhook_id TEXT NOT NULL REFERENCES text_webhooks(id) ON DELETE CASCADE,
    sender_name TEXT NOT NULL,
    sender_avatar_url TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_text_webhook_messages_channel_created
    ON text_webhook_messages(channel_id, created_at DESC);
`);

// O NexMusic mantém um único player persistente por canal de texto. Limpa
// duplicatas deixadas pela versão anterior antes de aplicar a unicidade.
db.exec(`
  DELETE FROM text_bot_messages
  WHERE rowid NOT IN (
    SELECT MAX(rowid) FROM text_bot_messages GROUP BY channel_id
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_text_bot_messages_channel_unique
    ON text_bot_messages(channel_id);
`);

db.prepare(
  `INSERT OR IGNORE INTO text_channels (id, name, description, created_by, created_at)
   VALUES ('geral', 'geral', 'Conversa geral da comunidade', NULL, ?)`,
).run(Date.now());

function ensureColumns(table: string, columns: readonly (readonly [string, string])[]): void {
  const existing = new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name),
  );
  for (const [column, definition] of columns) {
    if (!existing.has(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}

ensureColumns('users', [
  ['bio', "TEXT NOT NULL DEFAULT ''"],
  ['pronouns', "TEXT NOT NULL DEFAULT ''"],
  ['avatar_data_url', "TEXT NOT NULL DEFAULT ''"],
  // Borda animada do avatar (um id de AVATAR_FRAME_IDS; '' = sem borda) e, na capa do perfil, se ela é animada e a versão
  // (sobe a cada troca) que vai na URL para o navegador não reaproveitar a imagem antiga.
  ['avatar_frame', "TEXT NOT NULL DEFAULT ''"],
  // O que a pessoa escolheu mostrar (online, ausente, não perturbe, invisível) e a organização dela da lista de servidores
  // (JSON com servidores soltos e pastas; vazio = sem organização).
  ['presence_status', "TEXT NOT NULL DEFAULT 'online'"],
  ['server_layout', "TEXT NOT NULL DEFAULT ''"],
  ['banner_animated', 'INTEGER NOT NULL DEFAULT 0'],
  ['assets_rev', 'INTEGER NOT NULL DEFAULT 0'],
  ['banner_data_url', "TEXT NOT NULL DEFAULT ''"],
  ['timeout_until', 'INTEGER'],
  // Verificação de idade/identidade (KYC) — desnormalizado aqui (em vez de só na tabela de
  // tentativas abaixo) porque é lido a cada publicação de câmera/tela no webhook do LiveKit,
  // e um JOIN nessa checagem custaria caro nesse caminho. Nunca guarda documento/biometria,
  // só o resultado do vendor e uma referência opaca pra correlacionar com o webhook.
  ['identity_verification_status', "TEXT NOT NULL DEFAULT 'unverified'"],
  ['identity_verified_at', 'INTEGER'],
  ['identity_verification_ref', "TEXT NOT NULL DEFAULT ''"],
]);

db.exec(`
  CREATE TABLE IF NOT EXISTS identity_verification_attempts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vendor TEXT NOT NULL,
    vendor_session_ref TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','expired')),
    failure_reason TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_identity_verification_attempts_user
    ON identity_verification_attempts(user_id, created_at DESC);
`);

ensureColumns('text_messages', [
  ['edited_at', 'INTEGER'],
  // Sem FK aqui de propósito: SQLite valida FKs só na hora de escrever,
  // então referenciar uma mensagem que pode ter sido apagada é seguro —
  // basta o app tratar "não encontrada" ao resolver o preview da resposta.
  ['reply_to_message_id', 'TEXT'],
  ['pinned_at', 'INTEGER'],
  ['pinned_by', 'TEXT'],
  // Mensagem postada com a identidade do servidor (nome + ícone) em vez do
  // autor real — sender_id continua sendo quem de fato postou, preservado
  // pra moderação/auditoria; só a exibição muda (ver toMessage em textChannels.ts).
  ['posted_as_system', 'INTEGER NOT NULL DEFAULT 0'],
]);

ensureColumns('servers', [
  // Reaproveita a mesma paleta ACCENT_COLORS de usuários (packages/shared)
  // pra "faixa" colorida do perfil do servidor — sem inventar uma segunda
  // paleta. NULL = ainda sem cor escolhida (perfil mostra o degradê padrão).
  ['accent_color', 'TEXT'],
  // Painel (banner) do servidor, como o ícone: data: URL de uma imagem ou GIF animado. Os "animated" são calculados ao
  // gravar (para a lista de servidores não precisar decodificar megabytes) e assets_rev sobe a cada troca de ícone ou
  // painel, virando a versão na URL para o navegador não reaproveitar a imagem antiga.
  ['banner_data_url', "TEXT NOT NULL DEFAULT ''"],
  ['icon_animated', 'INTEGER NOT NULL DEFAULT 0'],
  ['banner_animated', 'INTEGER NOT NULL DEFAULT 0'],
  ['assets_rev', 'INTEGER NOT NULL DEFAULT 0'],
]);

// NexDex, o jogo de captura de Pokémon: jogadores (Pokébolas), coleção, time, Pokémon selvagem aberto de cada pessoa e as
// mensagens do jogo nos canais de texto.
db.exec(`
  CREATE TABLE IF NOT EXISTS pokemon_players (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balls INTEGER NOT NULL,
    last_daily TEXT NOT NULL DEFAULT '',
    last_spawn_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pokemon_caught (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    no INTEGER NOT NULL,
    species_id INTEGER NOT NULL,
    shiny INTEGER NOT NULL DEFAULT 0,
    caught_at INTEGER NOT NULL,
    UNIQUE (user_id, no)
  );
  CREATE TABLE IF NOT EXISTS pokemon_team (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot INTEGER NOT NULL,
    caught_id TEXT NOT NULL UNIQUE REFERENCES pokemon_caught(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, slot)
  );
  CREATE TABLE IF NOT EXISTS pokemon_spawns (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    server_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    species_id INTEGER NOT NULL,
    shiny INTEGER NOT NULL DEFAULT 0,
    spawned_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS text_game_messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES text_channels(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    card_json TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_text_game_messages_channel ON text_game_messages(channel_id, created_at);
  -- Desafios de batalha ainda abertos: cada pessoa só tem um desafio por vez (o novo substitui o antigo).
  CREATE TABLE IF NOT EXISTS pokemon_challenges (
    challenger_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    opponent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    server_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pokemon_challenges_opponent ON pokemon_challenges(opponent_id);
`);

// Placar das batalhas e o limite de Pokébolas ganhas por dia nelas.
ensureColumns('pokemon_players', [
  ['battle_wins', 'INTEGER NOT NULL DEFAULT 0'],
  ['battle_losses', 'INTEGER NOT NULL DEFAULT 0'],
  ['reward_date', "TEXT NOT NULL DEFAULT ''"],
  ['rewards_today', 'INTEGER NOT NULL DEFAULT 0'],
]);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_text_messages_channel_pinned
    ON text_messages(channel_id, pinned_at DESC);
`);

// Encaminhar mensagem: sem FK aqui de propósito, mesmo motivo do comentário
// de reply_to_message_id acima — a origem pode estar em outro canal/
// servidor/DM que o usuário atual nem tem mais acesso (ou que foi apagado),
// e não existe (ainda) nenhuma UI de "ir para a mensagem original" que
// precisaria resolver isso ao vivo. Exatamente um entre (server_id +
// channel_id) ou dm_channel_id fica preenchido, nunca os dois — depende de a
// origem ter sido uma mensagem de canal ou de DM.
const FORWARD_COLUMNS: readonly (readonly [string, string])[] = [
  ['forwarded_from_author_name', 'TEXT'],
  ['forwarded_from_message_id', 'TEXT'],
  ['forwarded_from_server_id', 'TEXT'],
  ['forwarded_from_channel_id', 'TEXT'],
  ['forwarded_from_dm_channel_id', 'TEXT'],
];
ensureColumns('text_messages', FORWARD_COLUMNS);
ensureColumns('dm_messages', FORWARD_COLUMNS);

// Canais de voz eram só o env var VOICE_CHANNELS, parseado no boot (ver
// config.ts) — agora viram linhas reais, mas sem perder o que já estava
// configurado em produção: só semeia se a tabela ainda estiver vazia (ou
// seja, primeira vez que este código roda contra um banco existente).
const voiceChannelCount = (
  db.prepare('SELECT COUNT(*) AS count FROM voice_channels').get() as { count: number }
).count;
if (voiceChannelCount === 0) {
  const insertVoiceChannel = db.prepare(
    'INSERT INTO voice_channels (id, name, description, position, created_by, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
  );
  const seededAt = Date.now();
  config.channels.forEach((channel, index) => {
    insertVoiceChannel.run(channel.id, channel.name, channel.description, index, seededAt);
  });
}

// Fundação de múltiplos servidores: server_id nullable no ALTER (SQLite não
// aceita NOT NULL sem default numa tabela não vazia), preenchido no bloco de
// migração logo abaixo antes de qualquer leitura assumir que já é NOT NULL.
ensureColumns('text_channels', [['server_id', 'TEXT REFERENCES servers(id) ON DELETE CASCADE']]);
ensureColumns('voice_channels', [['server_id', 'TEXT REFERENCES servers(id) ON DELETE CASCADE']]);
ensureColumns('roles', [['server_id', 'TEXT REFERENCES servers(id) ON DELETE CASCADE']]);
ensureColumns('soundboard_sounds', [['server_id', 'TEXT REFERENCES servers(id) ON DELETE CASCADE']]);

// Cria o cargo @everyone (mesmas permissões que todo mundo já tinha antes de
// cargos existirem) + promove `ownerId` a Administrador com permissão total.
// Reaproveitada tanto pela migração do servidor padrão (abaixo) quanto por
// createServer() em servers.ts pra todo servidor novo — um único caminho de
// código pra "cargos iniciais de um servidor". Ids sempre gerados via
// randomUUID(): roles.id é chave primária global (não composta por
// servidor), então dois servidores nunca podem compartilhar o mesmo id de
// cargo.
export function bootstrapServerRoles(
  serverId: string,
  memberUserIds: readonly string[],
  ownerId: string | null,
): void {
  const everyoneRoleId = randomUUID();
  const seededAt = Date.now();
  db.prepare(
    'INSERT INTO roles (id, server_id, name, color, position, hoist, permissions, created_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?)',
  ).run(everyoneRoleId, serverId, '@everyone', '#8a91a6', DEFAULT_EVERYONE_PERMISSIONS, seededAt);

  const insertUserRole = db.prepare(
    'INSERT OR IGNORE INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)',
  );
  for (const userId of memberUserIds) {
    insertUserRole.run(userId, everyoneRoleId, seededAt);
  }

  if (ownerId) {
    const adminRoleId = randomUUID();
    db.prepare(
      'INSERT INTO roles (id, server_id, name, color, position, hoist, permissions, created_at) VALUES (?, ?, ?, ?, 100, 1, ?, ?)',
    ).run(adminRoleId, serverId, 'Administrador', '#ee7798', Permission.ADMINISTRATOR, seededAt);
    insertUserRole.run(ownerId, adminRoleId, seededAt);
  }
}

// Migração pra fundação de múltiplos servidores: se `servers` ainda está
// vazia, este é o primeiro boot depois da migração — cria o servidor padrão
// ("Lobby dos amigos", dono = conta mais antiga) e migra todo mundo/tudo pra
// ele, preservando o comportamento atual pixel a pixel (nenhum usuário,
// canal, cargo ou timeout ativo é perdido). Servidores criados depois disso
// nunca passam por este bloco de novo (é condicional só a `servers` vazia).
const serverCount = (db.prepare('SELECT COUNT(*) AS count FROM servers').get() as { count: number }).count;
let defaultServerId: string;
if (serverCount === 0) {
  const seededAt = Date.now();
  const allUsers = db.prepare('SELECT id, created_at, timeout_until FROM users').all() as {
    id: string;
    created_at: number;
    timeout_until: number | null;
  }[];
  const owner = allUsers.length
    ? allUsers.reduce((oldest, user) => (user.created_at < oldest.created_at ? user : oldest))
    : null;

  defaultServerId = randomUUID();
  db.prepare(
    'INSERT INTO servers (id, name, description, icon_data_url, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    defaultServerId,
    'Lobby dos amigos',
    'Um lugar para conversar, jogar e compartilhar bons momentos.',
    '',
    owner?.id ?? null,
    seededAt,
  );

  const insertMember = db.prepare(
    'INSERT OR IGNORE INTO server_members (server_id, user_id, joined_at, timeout_until) VALUES (?, ?, ?, ?)',
  );
  for (const user of allUsers) {
    insertMember.run(defaultServerId, user.id, seededAt, user.timeout_until);
  }

  db.prepare('UPDATE text_channels SET server_id = ? WHERE server_id IS NULL').run(defaultServerId);
  db.prepare('UPDATE voice_channels SET server_id = ? WHERE server_id IS NULL').run(defaultServerId);
  db.prepare('UPDATE soundboard_sounds SET server_id = ? WHERE server_id IS NULL').run(defaultServerId);

  // Cargos não existiam antes desta seção do código já ter rodado uma vez
  // (tabela `roles` vazia, banco recém-criado) — reaproveita bootstrapServerRoles.
  // Se `roles` já tinha linhas (o caso real de produção: banco que já
  // rodava antes desta migração existir), só faltava mesmo o server_id —
  // backfilled acima, sem recriar nenhum cargo.
  const roleCount = (db.prepare('SELECT COUNT(*) AS count FROM roles').get() as { count: number }).count;
  if (roleCount === 0) {
    bootstrapServerRoles(defaultServerId, allUsers.map((user) => user.id), owner?.id ?? null);
  } else {
    db.prepare('UPDATE roles SET server_id = ? WHERE server_id IS NULL').run(defaultServerId);
  }
}


// text_channels.name e roles.name eram UNIQUE globais (antes de múltiplos
// servidores existirem) — sem corrigir isso, o primeiro servidor novo que
// tentasse ter um canal/cargo com o mesmo nome de outro servidor (ex.: o
// canal padrão "geral") tomaria um 409 falso. SQLite não tem
// `ALTER TABLE DROP CONSTRAINT`, então a única forma de trocar pra
// UNIQUE(server_id, name) é reconstruir a tabela inteira. Roda só uma vez
// (guardado por hasLegacyGlobalUniqueName, que some assim que a constraint
// nova existe) e sempre depois do backfill de server_id acima, pra que a
// constraint nova já nasça satisfeita.
function hasLegacyGlobalUniqueName(table: string): boolean {
  const indexes = db.prepare(`PRAGMA index_list(${table})`).all() as { name: string; unique: number }[];
  return indexes.some((index) => {
    if (!index.unique) return false;
    const columns = db.prepare(`PRAGMA index_info(${index.name})`).all() as { name: string }[];
    return columns.length === 1 && columns[0]?.name === 'name';
  });
}

function rebuildWithServerScopedUniqueName(table: string, createNewTableSql: string, columns: string): void {
  if (!hasLegacyGlobalUniqueName(table)) return;
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(createNewTableSql);
    db.exec(`INSERT INTO ${table}_new (${columns}) SELECT ${columns} FROM ${table}`);
    db.exec(`DROP TABLE ${table}`);
    db.exec(`ALTER TABLE ${table}_new RENAME TO ${table}`);
    const problems = db.prepare('PRAGMA foreign_key_check').all();
    if (problems.length > 0) {
      throw new Error(`PRAGMA foreign_key_check falhou reconstruindo ${table}: ${JSON.stringify(problems)}`);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

rebuildWithServerScopedUniqueName(
  'text_channels',
  `CREATE TABLE text_channels_new (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL COLLATE NOCASE,
    description TEXT NOT NULL DEFAULT '',
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (server_id, name COLLATE NOCASE)
  )`,
  'id, server_id, name, description, created_by, created_at',
);

rebuildWithServerScopedUniqueName(
  'roles',
  `CREATE TABLE roles_new (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL COLLATE NOCASE,
    color TEXT NOT NULL,
    position INTEGER NOT NULL,
    hoist INTEGER NOT NULL DEFAULT 0,
    permissions INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    UNIQUE (server_id, name COLLATE NOCASE)
  )`,
  'id, server_id, name, color, position, hoist, permissions, created_at',
);

// Configurações de canal (ver DISCORD_PARITY_PLAN.md): content_visibility
// guarda só o rótulo ('default'/'spoiler'/'age_restricted') — este app não
// tem gate de confirmação de idade nem filtro de spoiler de fato, é
// só o selo visual + o dado persistido, honesto sobre o que falta.
// is_announcement idem: guarda a intenção, mas "outros servidores seguirem
// este canal" não existe nesta instância única self-hosted.
//
// Rodam DEPOIS de rebuildWithServerScopedUniqueName acima de propósito: essa
// reconstrução recria text_channels do zero com uma lista explícita de
// colunas (a migração legada de nome único global -> por servidor) — se
// estas chamadas rodassem antes, o rebuild apagaria category_id/topic/etc.
// silenciosamente em qualquer banco que ainda não tivesse passado por ele
// (ex.: banco novo), porque a lista de colunas do rebuild não as conhece.
ensureColumns('text_channels', [
  ['category_id', 'TEXT REFERENCES categories(id) ON DELETE SET NULL'],
  ['position', 'INTEGER NOT NULL DEFAULT 0'],
  ['topic', "TEXT NOT NULL DEFAULT ''"],
  ['slow_mode_seconds', 'INTEGER NOT NULL DEFAULT 0'],
  ['content_visibility', "TEXT NOT NULL DEFAULT 'default'"],
  ['is_announcement', 'INTEGER NOT NULL DEFAULT 0'],
]);

ensureColumns('voice_channels', [
  ['category_id', 'TEXT REFERENCES categories(id) ON DELETE SET NULL'],
  ['slow_mode_seconds', 'INTEGER NOT NULL DEFAULT 0'],
  ['content_visibility', "TEXT NOT NULL DEFAULT 'default'"],
  // 0 = "Auto" (sem teto explícito) pros dois campos abaixo, mesma
  // convenção do resto do schema pra "sem limite"/"usar padrão do LiveKit".
  ['bitrate_kbps', 'INTEGER NOT NULL DEFAULT 0'],
  ['video_quality', "TEXT NOT NULL DEFAULT 'auto'"],
  ['user_limit', 'INTEGER NOT NULL DEFAULT 0'],
]);
