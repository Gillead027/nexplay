import { useState } from 'react';
import { POKEMON_RARITY_LABELS, type PokemonBattle, type PokemonCard, type PokemonCardEntry, type PokemonInfo } from '@nexplay/shared';

// A imagem vem do servidor (que a baixa da PokeAPI na primeira vez e guarda em disco); pixelada, como no jogo.
function Sprite({ entry, big = false }: { entry: PokemonCardEntry; big?: boolean }) {
  return (
    <span className={`pokemon-sprite-frame ${big ? 'big' : ''} rarity-${entry.rarity} ${entry.shiny ? 'shiny' : ''}`}>
      <img
        className="pokemon-sprite"
        src={`/api/pokemon/sprite/${entry.speciesId}${entry.shiny ? '?shiny=1' : ''}`}
        alt={entry.name}
        loading="lazy"
        draggable={false}
      />
    </span>
  );
}

function RarityBadge({ entry }: { entry: PokemonCardEntry }) {
  return <span className={`pokemon-rarity rarity-${entry.rarity}`}>{POKEMON_RARITY_LABELS[entry.rarity]}</span>;
}

const STATUS_TEXT: Record<NonNullable<PokemonCard['status']>, string> = {
  wild: '',
  caught: 'Capturado!',
  fled: 'Fugiu…',
  expired: 'Foi embora.',
  pending: 'Aguardando resposta…',
  accepted: 'Desafio aceito!',
  declined: 'Desafio recusado.',
};

// Cor de cada tipo (os nomes vêm em português do servidor).
const TYPE_COLORS: Record<string, string> = {
  Normal: '#a8a878', Lutador: '#c03028', Voador: '#a890f0', Venenoso: '#a040a0', Terrestre: '#e0c068', Pedra: '#b8a038',
  Inseto: '#a8b820', Fantasma: '#705898', Aço: '#b8b8d0', Fogo: '#f08030', Água: '#6890f0', Planta: '#78c850',
  Elétrico: '#f8d030', Psíquico: '#f85888', Gelo: '#98d8d8', Dragão: '#7038f8', Sombrio: '#705848', Fada: '#ee99ac',
};

const STAT_LABELS: [keyof PokemonInfo['stats'], string][] = [
  ['hp', 'HP'],
  ['attack', 'Ataque'],
  ['defense', 'Defesa'],
  ['specialAttack', 'Atq. Esp.'],
  ['specialDefense', 'Def. Esp.'],
  ['speed', 'Veloc.'],
];

function TypeBadges({ types }: { types: string[] }) {
  return (
    <span className="pokemon-types">
      {types.map((type) => (
        <span key={type} className="pokemon-type" style={{ background: TYPE_COLORS[type] ?? '#7c8cb9' }}>{type}</span>
      ))}
    </span>
  );
}

function StatBars({ info }: { info: PokemonInfo }) {
  return (
    <div className="pokemon-stats">
      {STAT_LABELS.map(([key, name]) => {
        const value = info.stats[key];
        return (
          <div key={key} className="pokemon-stat">
            <span className="pokemon-stat-name">{name}</span>
            <b>{value}</b>
            <span className="pokemon-stat-bar"><i style={{ width: `${Math.min(100, (value / 200) * 100)}%` }} className={value >= 100 ? 'high' : value >= 60 ? 'mid' : 'low'} /></span>
          </div>
        );
      })}
      <div className="pokemon-stat total"><span className="pokemon-stat-name">Total</span><b>{info.total}</b></div>
    </div>
  );
}

function BattleSide({ name, team, winner }: { name: string; team: PokemonCardEntry[]; winner?: boolean }) {
  return (
    <div className={`battle-side ${winner ? 'winner' : ''}`}>
      <strong>{winner ? '🏆 ' : ''}{name}</strong>
      <div className="battle-team">
        {team.map((entry, index) => (
          <span key={index} className="battle-mon" title={entry.name}>
            <Sprite entry={entry} />
          </span>
        ))}
      </div>
    </div>
  );
}

function BattleBoard({ battle }: { battle: PokemonBattle }) {
  return (
    <div className="battle-board">
      <BattleSide name={battle.challengerName} team={battle.teamA} winner={battle.winnerId === battle.challengerId} />
      <span className="battle-vs">VS</span>
      <BattleSide name={battle.opponentName} team={battle.teamB} winner={battle.winnerId === battle.opponentId} />
    </div>
  );
}

/** O cartão do NexDex: um Pokémon selvagem, uma captura, o time, a ficha de uma espécie, um desafio de batalha ou o resultado dela. */
export function PokemonCardView({ card, viewerId, onCommand }: { card: PokemonCard; viewerId: string; onCommand: (command: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  async function run(command: string) {
    if (busy) return;
    setBusy(true);
    try {
      await onCommand(command);
    } catch {
      // O erro (rede, permissão) aparece pelos avisos do app; o botão só volta a ficar disponível.
    } finally {
      setBusy(false);
    }
  }

  if (card.kind === 'team') {
    const slots = Array.from({ length: 6 }, (_, index) => card.entries[index] ?? null);
    return (
      <div className="pokemon-card team">
        <strong className="pokemon-card-title">{card.title}</strong>
        <div className="pokemon-team-grid">
          {slots.map((entry, index) => (
            <div key={index} className={`pokemon-team-slot ${entry ? '' : 'empty'}`}>
              {entry ? (
                <>
                  <Sprite entry={entry} />
                  <span className="pokemon-name">{entry.shiny ? '✨ ' : ''}{entry.name}</span>
                  <small>#{entry.no}</small>
                </>
              ) : (
                <span className="pokemon-slot-empty">Vago</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if ((card.kind === 'challenge' || card.kind === 'battle') && card.battle) {
    const { battle } = card;
    const status = card.status ?? 'pending';
    if (card.kind === 'challenge') {
      const pending = status === 'pending';
      const isOpponent = battle.opponentId === viewerId;
      const isChallenger = battle.challengerId === viewerId;
      return (
        <div className={`pokemon-card challenge status-${status}`}>
          <strong className="pokemon-card-title">{card.title}</strong>
          <BattleBoard battle={battle} />
          {pending && isOpponent && (
            <div className="pokemon-actions">
              <button type="button" className="pokemon-catch" disabled={busy} onClick={() => void run('!aceitar')}>Aceitar</button>
              <button type="button" className="pokemon-flee" disabled={busy} onClick={() => void run('!recusar')}>Recusar</button>
            </div>
          )}
          {pending && isChallenger && (
            <div className="pokemon-actions">
              <span className="pokemon-line">Aguardando {battle.opponentName}…</span>
              <button type="button" className="pokemon-flee" disabled={busy} onClick={() => void run('!recusar')}>Cancelar</button>
            </div>
          )}
          {pending && !isOpponent && !isChallenger && <span className="pokemon-line">Aguardando {battle.opponentName}…</span>}
          {!pending && <span className="pokemon-line">{STATUS_TEXT[status]}</span>}
        </div>
      );
    }
    return (
      <div className="pokemon-card battle">
        <strong className="pokemon-card-title">{card.title}</strong>
        <BattleBoard battle={battle} />
        {battle.lines && battle.lines.length > 0 && (
          <ol className="battle-log">
            {battle.lines.map((line, index) => (
              <li key={index} className={line.side === 'A' ? 'side-a' : 'side-b'}>
                <b>{line.winner}</b> derrubou <b>{line.loser}</b> <small>({line.hpLeftPercent}% de vida)</small>
              </li>
            ))}
          </ol>
        )}
        <span className="pokemon-line battle-verdict">
          🏆 {battle.winnerName} venceu{battle.reward ? ` e ganhou ${battle.reward} Pokébolas` : ''}
        </span>
      </div>
    );
  }

  const entry = card.entries[0];
  if (!entry) return null;

  if (card.kind === 'info' && card.info) {
    return (
      <div className={`pokemon-card info rarity-${entry.rarity}`}>
        <Sprite entry={entry} big />
        <div className="pokemon-card-body">
          <strong className="pokemon-card-title">{card.title}</strong>
          <span className="pokemon-name">{entry.shiny ? '✨ ' : ''}{entry.name} <RarityBadge entry={entry} /></span>
          <TypeBadges types={card.info.types} />
          <StatBars info={card.info} />
        </div>
      </div>
    );
  }

  const status = card.status ?? 'wild';
  const open = card.kind === 'wild' && status === 'wild';
  const mine = card.ownerId === viewerId;

  return (
    <div className={`pokemon-card ${card.kind} status-${status} rarity-${entry.rarity}`}>
      <Sprite entry={entry} big />
      <div className="pokemon-card-body">
        <strong className="pokemon-card-title">{card.title}</strong>
        <span className="pokemon-name">{entry.shiny ? '✨ ' : ''}{entry.name} <RarityBadge entry={entry} /></span>
        {card.kind === 'caught' && <span className="pokemon-line">#{entry.no} na coleção de {card.ownerName}{card.balls !== undefined ? ` · Pokébolas: ${card.balls}` : ''}</span>}
        {card.kind === 'wild' && !open && <span className="pokemon-line">{STATUS_TEXT[status]}</span>}
        {open && mine && (
          <div className="pokemon-actions">
            <button type="button" className="pokemon-catch" disabled={busy} onClick={() => void run('!capturar')}>
              Capturar{card.balls !== undefined ? ` (${card.balls} Pokébola${card.balls === 1 ? '' : 's'})` : ''}
            </button>
            <button type="button" className="pokemon-flee" disabled={busy} onClick={() => void run('!fugir')}>Fugir</button>
          </div>
        )}
        {open && !mine && <span className="pokemon-line">Este Pokémon apareceu para {card.ownerName}.</span>}
      </div>
    </div>
  );
}
