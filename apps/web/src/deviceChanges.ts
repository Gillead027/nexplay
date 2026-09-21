export interface DeviceLite {
  deviceId: string;
  label: string;
}

export type DeviceKind = 'audioinput' | 'audiooutput' | 'videoinput';

// O navegador lista "default" e "communications" como atalhos pro dispositivo atual do
// sistema. Eles não são um aparelho novo nem um aparelho que sumiu.
const VIRTUAL_IDS = new Set(['default', 'communications']);

export function diffDevices(previous: DeviceLite[] | null, next: DeviceLite[]): { added: DeviceLite[]; removed: DeviceLite[] } {
  // Sem permissão de mídia a lista vem sem ids: quando a permissão sai, tudo pareceria "novo".
  if (previous === null || !previous.some((device) => device.deviceId)) return { added: [], removed: [] };
  const before = new Set(previous.map((device) => device.deviceId));
  const after = new Set(next.map((device) => device.deviceId));
  return {
    added: next.filter((device) => device.deviceId && !VIRTUAL_IDS.has(device.deviceId) && !before.has(device.deviceId)),
    removed: previous.filter((device) => device.deviceId && !VIRTUAL_IDS.has(device.deviceId) && !after.has(device.deviceId)),
  };
}

// O aparelho escolhido deixou de existir? Sem permissão de mídia o navegador devolve a
// lista sem ids: nesse caso não dá pra afirmar nada e não se troca a escolha.
export function selectionLost(selectedId: string, devices: DeviceLite[]): boolean {
  if (VIRTUAL_IDS.has(selectedId)) return false;
  if (!devices.some((device) => device.deviceId)) return false;
  return !devices.some((device) => device.deviceId === selectedId);
}

const LOST_MESSAGE: Record<DeviceKind, string> = {
  audioinput: 'O microfone escolhido foi desconectado. Passamos a usar o microfone padrão.',
  audiooutput: 'A saída de áudio escolhida foi desconectada. Passamos a usar a saída padrão.',
  videoinput: 'A câmera escolhida foi desconectada. Passamos a usar a câmera padrão.',
};

const KIND_NAME: Record<DeviceKind, string> = {
  audioinput: 'microfone',
  audiooutput: 'saída de áudio',
  videoinput: 'câmera',
};

export function deviceLostMessage(kind: DeviceKind): string {
  return LOST_MESSAGE[kind];
}

export function deviceAddedMessage(kind: DeviceKind, device: DeviceLite): string {
  const label = device.label ? '“' + device.label + '”' : 'Um novo dispositivo';
  return label + ' foi conectado (' + KIND_NAME[kind] + '). Para usá-lo, escolha em Configurações > Voz e vídeo.';
}
