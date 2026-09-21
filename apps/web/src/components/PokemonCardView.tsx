import { useState } from 'react';
import { POKEMON_RARITY_LABELS, type PokemonCard, type PokemonCardEntry } from '@nexplay/shared';

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
};

/** O cartão do NexDex: um Pokémon selvagem (com os botões Capturar/Fugir para quem o encontrou), uma captura ou o time. */
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

  const entry = card.entries[0];
  if (!entry) return null;
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
