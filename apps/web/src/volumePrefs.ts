// Volume que o usuário escolhe pra cada pessoa da call (voz e áudio de
// transmissão). Antes vivia só em estado do React e voltava a 100 a cada vez
// que o app era fechado; agora fica no localStorage, por conta, no formato
// { [identity]: 0..100 }.
//
// É preferência de escuta deste dispositivo: não viaja pra outros aparelhos nem
// pro servidor, igual ao volume de saída e ao perfil de microfone.

export const DEFAULT_PERSON_VOLUME = 100;
const MAX_ENTRIES = 500;
const MAX_KEY_LENGTH = 128;

export type VolumeKind = 'voice' | 'stream';

// Uma chave por conta: em um computador compartilhado, o volume que uma pessoa
// ajustou pra um amigo não vale pra quem entrar depois com outra conta.
export function volumeStorageKey(kind: VolumeKind, userId: string): string {
  return `np:${kind}-volumes:${userId}`;
}

function clampVolume(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

// Lê o que estiver guardado sem confiar nele: ignora JSON quebrado, chaves
// estranhas e valores fora de 0..100, e limita o tamanho. Volume igual ao
// padrão não precisa ser guardado.
export function parseVolumes(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
  const result: Record<string, number> = {};
  for (const [identity, value] of Object.entries(data as Record<string, unknown>)) {
    if (Object.keys(result).length >= MAX_ENTRIES) break;
    if (identity.length === 0 || identity.length > MAX_KEY_LENGTH) continue;
    if (identity === '__proto__') continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const volume = clampVolume(value);
    if (volume !== DEFAULT_PERSON_VOLUME) result[identity] = volume;
  }
  return result;
}

export function serializeVolumes(volumes: Record<string, number>): string {
  return JSON.stringify(parseVolumes(JSON.stringify(volumes)));
}

export function loadVolumes(storageKey: string): Record<string, number> {
  try {
    return parseVolumes(localStorage.getItem(storageKey));
  } catch {
    // Armazenamento bloqueado (janela privada, dados do site limpos): segue no padrão.
    return {};
  }
}

export function saveVolumes(storageKey: string, volumes: Record<string, number>): void {
  try {
    const serialized = serializeVolumes(volumes);
    if (serialized === '{}') localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, serialized);
  } catch {
    // Sem armazenamento, o volume vale só até fechar o app.
  }
}
