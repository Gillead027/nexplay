import { readSelfMuted } from '@nexplay/shared';

// O ícone de microfone mutado só existe quando a pessoa está numa chamada e
// mutou (ou ensurdeceu) de verdade. Fora da chamada, e ao abrir o app, o
// microfone aparece normal: não há nada mutado.
export function isMicShownMuted({
  connected,
  deafened,
  userMuted,
}: {
  connected: boolean;
  deafened: boolean;
  userMuted: boolean;
}): boolean {
  return connected && (deafened || userMuted);
}

export type LiveMicParticipant = {
  identity: string;
  isLocal: boolean;
  isMicrophoneEnabled: boolean;
  attributes?: Record<string, string>;
};

// Mute de cada pessoa da chamada em que você está agora, ao vivo, pra lista de
// canais da esquerda. Você mesmo usa o estado local; os outros usam o mute
// publicado por eles (atributo) e, se o app deles ainda não publicou, o estado
// do track de microfone.
export function liveMutedByIdentity(participants: LiveMicParticipant[], ownMuted: boolean): Map<string, boolean> {
  const muted = new Map<string, boolean>();
  for (const participant of participants) {
    muted.set(
      participant.identity,
      participant.isLocal ? ownMuted : (readSelfMuted(participant.attributes) ?? !participant.isMicrophoneEnabled),
    );
  }
  return muted;
}
