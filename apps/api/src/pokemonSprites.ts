import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { POKEMON_SPECIES_COUNT } from '@nexplay/shared';
import { config } from './config.js';

// As imagens dos Pokémon não ficam no repositório: a primeira vez que alguém precisa de uma, o servidor baixa da PokeAPI
// (https://github.com/PokeAPI/sprites) e guarda em disco, ao lado do banco. Dali em diante é só ler o arquivo.
const SPRITE_SOURCE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

export const isValidSpeciesId = (value: number): boolean => Number.isInteger(value) && value >= 1 && value <= POKEMON_SPECIES_COUNT;

function spritePath(speciesId: number, shiny: boolean): string {
  const directory = join(dirname(resolve(config.DB_PATH)), 'pokemon-sprites');
  mkdirSync(directory, { recursive: true });
  return join(directory, `${shiny ? 'shiny-' : ''}${speciesId}.png`);
}

export async function getPokemonSprite(speciesId: number, shiny: boolean): Promise<Buffer | null> {
  if (!isValidSpeciesId(speciesId)) return null;
  const path = spritePath(speciesId, shiny);
  if (existsSync(path)) return readFileSync(path);
  try {
    const response = await fetch(`${SPRITE_SOURCE}/${shiny ? 'shiny/' : ''}${speciesId}.png`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    // Só guarda se for mesmo um PNG (evita gravar uma página de erro como se fosse a imagem).
    if (bytes.length < 8 || bytes[0] !== 0x89 || bytes.toString('ascii', 1, 4) !== 'PNG') return null;
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, bytes);
    renameSync(temporary, path);
    return bytes;
  } catch {
    return null;
  }
}
