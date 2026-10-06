import type { CSSProperties } from 'react';
import type { ProfileEffect, UserCosmetics } from '@nexplay/shared';

// Quantidade de partículas de um efeito de perfil. Cada uma recebe posição e atraso pelo CSS (nth-child).
const EFFECT_PARTICLES = 14;

// Animação por cima do cartão de perfil (o "efeito de perfil" da Loja). Não recebe clique.
export function ProfileEffectLayer({ effect }: { effect: ProfileEffect | '' | undefined }) {
  if (!effect) return null;
  return (
    <div className={`profile-effect effect-${effect}`} aria-hidden="true">
      {Array.from({ length: EFFECT_PARTICLES }, (_, index) => <i key={index} />)}
    </div>
  );
}

// Tema do perfil: as duas cores viram variáveis do cartão. Sem tema, nada muda.
export function profileThemeStyle(cosmetics: UserCosmetics | undefined): CSSProperties | undefined {
  if (!cosmetics?.themePrimary || !cosmetics.themeAccent) return undefined;
  return { '--theme-primary': cosmetics.themePrimary, '--theme-accent': cosmetics.themeAccent } as CSSProperties;
}

export function hasProfileTheme(cosmetics: UserCosmetics | undefined): boolean {
  return Boolean(cosmetics?.themePrimary && cosmetics.themeAccent);
}
