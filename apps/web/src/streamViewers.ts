import { readWatching } from '@nexplay/shared';

// Quem está assistindo cada transmissão de tela. Cada pessoa publica, como atributo, as transmissões que abriu ("Ver transmissão");
// daqui saem a contagem de quem assiste, o olhinho ao lado do nome e os sons de entrar e sair.

export interface ViewerParticipant {
  identity: string;
  isLocal: boolean;
  attributes?: Record<string, string> | undefined;
}

/** O valor do atributo "watching": identidades sem repetição, em ordem fixa (para só republicar quando mudou de verdade). */
export function serializeWatching(identities: Iterable<string>): string {
  return [...new Set(identities)].sort().join(',');
}

/** Para cada pessoa que transmite: quem MAIS (as outras pessoas da chamada) está assistindo. Ninguém conta assistindo a própria tela. */
export function remoteViewersByStreamer(participants: readonly ViewerParticipant[]): Map<string, string[]> {
  const viewers = new Map<string, string[]>();
  for (const participant of participants) {
    if (participant.isLocal) continue;
    for (const streamer of readWatching(participant.attributes)) {
      if (streamer === participant.identity) continue;
      viewers.set(streamer, [...(viewers.get(streamer) ?? []), participant.identity]);
    }
  }
  return viewers;
}

/** Quem está assistindo alguma transmissão agora (o olhinho ao lado do nome). Você mesmo usa o estado local. */
export function watchingByIdentity(participants: readonly ViewerParticipant[], ownWatching: boolean): Map<string, boolean> {
  const watching = new Map<string, boolean>();
  for (const participant of participants) {
    watching.set(participant.identity, participant.isLocal ? ownWatching : readWatching(participant.attributes).some((id) => id !== participant.identity));
  }
  return watching;
}

/** Quantas pessoas assistem a transmissão de `streamerIdentity`: as outras da chamada mais você, se você a abriu. */
export function viewerCount(streamerIdentity: string, remote: ReadonlyMap<string, readonly string[]>, iAmWatching: boolean): number {
  return (remote.get(streamerIdentity)?.length ?? 0) + (iAmWatching ? 1 : 0);
}

/** O texto da contagem. Na própria transmissão diz também quando ninguém assiste; nas dos outros só aparece com gente assistindo. */
export function viewerCountLabel(count: number, ownStream: boolean): string | null {
  if (count <= 0) return ownStream ? 'Ninguém assistindo' : null;
  if (ownStream) return count === 1 ? '1 pessoa assistindo' : `${count} pessoas assistindo`;
  return `${count} assistindo`;
}

export interface ViewerBaseline {
  baseline: Map<string, string[]>;
  // Quantas pessoas ENTRARAM em transmissões que interessam a você (a sua ou as que você assiste) desde a leitura anterior, e quantas
  // SAÍRAM sem sair da chamada (quem saiu da chamada já tem o som de saída da chamada).
  joined: number;
  left: number;
}

/**
 * Compara quem assiste, desde a leitura anterior, só nas transmissões que interessam (`relevant`: a sua e as que você assiste).
 * Uma transmissão vista pela primeira vez vira ponto de partida SEM som — quem já estava assistindo antes de você chegar ou de você
 * abrir a transmissão não deve gerar barulho.
 */
export function nextViewerBaseline(
  previous: ReadonlyMap<string, readonly string[]>,
  remote: ReadonlyMap<string, readonly string[]>,
  relevant: ReadonlySet<string>,
  stillInCall: (identity: string) => boolean,
): ViewerBaseline {
  const baseline = new Map<string, string[]>();
  let joined = 0;
  let left = 0;
  for (const streamer of relevant) {
    const current = remote.get(streamer) ?? [];
    baseline.set(streamer, [...current]);
    const before = previous.get(streamer);
    if (!before) continue;
    joined += current.filter((id) => !before.includes(id)).length;
    left += before.filter((id) => !current.includes(id) && stillInCall(id)).length;
  }
  return { baseline, joined, left };
}
