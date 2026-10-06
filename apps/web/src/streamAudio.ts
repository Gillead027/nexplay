// Áudio de transmissão de tela é opt-in, igual ao vídeo: só toca pra quem clicou
// em "Ver transmissão". A sala está com autoSubscribe, então a faixa
// `ScreenShareAudio` de quem transmite chega pra todo mundo na call; sem esta
// regra ela era ligada num <audio> na hora, e a pessoa ouvia a transmissão (o
// jogo, a música, o vídeo do outro) sem nunca ter pedido pra assistir.

export interface ScreenViewLike {
  id: string;
  participantIdentity: string;
  isScreenShare: boolean;
}

// Quem, entre os participantes, tem uma transmissão de tela que o usuário está
// assistindo agora. O id da tela é `${identity}-${trackSid}` da faixa de vídeo,
// então quando a pessoa para e recomeça a transmitir o id muda e ela volta a
// ficar como "não assistida" até um novo clique — sem deixar áudio pendurado.
export function watchedStreamIdentities(screens: readonly ScreenViewLike[], watchingIds: ReadonlySet<string>): Set<string> {
  const identities = new Set<string>();
  for (const screen of screens) {
    if (screen.isScreenShare && watchingIds.has(screen.id)) identities.add(screen.participantIdentity);
  }
  return identities;
}

export interface AudioPublicationKind {
  isMicrophone: boolean;
  isScreenShareAudio: boolean;
  isSoundboard: boolean;
}

// Voz e soundboard tocam sempre; o áudio da transmissão só se o usuário estiver
// assistindo aquela transmissão.
export function shouldPlayAudioPublication(kind: AudioPublicationKind, watchingStream: boolean): boolean {
  if (kind.isScreenShareAudio) return watchingStream;
  return kind.isMicrophone || kind.isSoundboard;
}
