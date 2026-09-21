import type { ReactNode } from 'react';
import type { AvatarFrame } from '@nexplay/shared';

// A borda animada que a pessoa escolheu no perfil, desenhada em volta do avatar (o estilo de cada uma está em design.css).
// Sem borda escolhida, devolve o avatar como está.
export function AvatarRing({ frame, children }: { frame?: AvatarFrame | '' | undefined; children: ReactNode }) {
  if (!frame) return <>{children}</>;
  return <span className={`avatar-ring frame-${frame}`}>{children}</span>;
}
