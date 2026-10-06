// Itens de personalização da Loja (no formato da Loja do Discord). No NexPlay tudo é grátis: a Loja só escolhe.
// As artes são do NexPlay, feitas em CSS no app (ver apps/web/src/discord.css, "Loja").
//
// - Decoração de avatar: a borda animada (AVATAR_FRAME_IDS, em index.ts).
// - Efeito de perfil: animação por cima do cartão de perfil.
// - Plaquinha de nome: fundo atrás do nome na lista de membros.
// - Tema de perfil: as duas cores do cartão de perfil.

export const PROFILE_EFFECT_IDS = ['estrelas', 'neve', 'chamas', 'coracoes', 'confete', 'bolhas', 'vagalumes', 'petalas'] as const;
export type ProfileEffect = (typeof PROFILE_EFFECT_IDS)[number];
export const PROFILE_EFFECT_LABELS: Record<ProfileEffect, string> = {
  estrelas: 'Céu estrelado',
  neve: 'Nevasca',
  chamas: 'Brasas',
  coracoes: 'Corações',
  confete: 'Confete',
  bolhas: 'Bolhas',
  vagalumes: 'Vaga-lumes',
  petalas: 'Pétalas',
};

export const NAMEPLATE_IDS = ['cosmo', 'oceano', 'por-do-sol', 'floresta', 'neon', 'sakura', 'lava', 'glacial'] as const;
export type Nameplate = (typeof NAMEPLATE_IDS)[number];
export const NAMEPLATE_LABELS: Record<Nameplate, string> = {
  cosmo: 'Cosmo',
  oceano: 'Oceano',
  'por-do-sol': 'Pôr do sol',
  floresta: 'Floresta',
  neon: 'Cidade neon',
  sakura: 'Sakura',
  lava: 'Lava',
  glacial: 'Glacial',
};

export interface UserCosmetics {
  profileEffect: ProfileEffect | '';
  nameplate: Nameplate | '';
  // Tema do perfil: duas cores #rrggbb (as duas vazias = sem tema).
  themePrimary: string;
  themeAccent: string;
}

export const EMPTY_COSMETICS: UserCosmetics = { profileEffect: '', nameplate: '', themePrimary: '', themeAccent: '' };

export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

// Lê o JSON guardado no banco sem confiar nele: o que não for válido volta vazio.
export function parseCosmetics(raw: string | null | undefined): UserCosmetics {
  if (!raw) return { ...EMPTY_COSMETICS };
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof UserCosmetics, unknown>>;
    const effect = typeof value.profileEffect === 'string' && (PROFILE_EFFECT_IDS as readonly string[]).includes(value.profileEffect)
      ? (value.profileEffect as ProfileEffect) : '';
    const nameplate = typeof value.nameplate === 'string' && (NAMEPLATE_IDS as readonly string[]).includes(value.nameplate)
      ? (value.nameplate as Nameplate) : '';
    const primary = typeof value.themePrimary === 'string' && HEX_COLOR_PATTERN.test(value.themePrimary) ? value.themePrimary : '';
    const accent = typeof value.themeAccent === 'string' && HEX_COLOR_PATTERN.test(value.themeAccent) ? value.themeAccent : '';
    // Tema só vale com as duas cores.
    return { profileEffect: effect, nameplate, themePrimary: primary && accent ? primary : '', themeAccent: primary && accent ? accent : '' };
  } catch {
    return { ...EMPTY_COSMETICS };
  }
}

// Temas prontos da Loja (a pessoa também pode escolher as duas cores à mão).
export const PROFILE_THEME_PRESETS: readonly { id: string; label: string; primary: string; accent: string }[] = [
  { id: 'meia-noite', label: 'Meia-noite', primary: '#1b2a6b', accent: '#5865f2' },
  { id: 'aurora', label: 'Aurora', primary: '#0f5f5a', accent: '#7b61ff' },
  { id: 'brasa', label: 'Brasa', primary: '#7a1f12', accent: '#f0a020' },
  { id: 'algodao-doce', label: 'Algodão-doce', primary: '#c94f9b', accent: '#5bc0f8' },
  { id: 'floresta', label: 'Floresta', primary: '#163d22', accent: '#57a05a' },
  { id: 'grafite', label: 'Grafite', primary: '#1e1f22', accent: '#6d6f78' },
  { id: 'oceano', label: 'Oceano', primary: '#0b3954', accent: '#1fb5c9' },
  { id: 'vinho', label: 'Vinho', primary: '#4a0d2a', accent: '#c2185b' },
];
