import type { CaptureSourceView, PickerShareQuality } from './picker-preload';

declare global {
  interface Window {
    capturePicker: {
      listSources: () => Promise<CaptureSourceView[]>;
      chooseSource: (sourceId: string, quality: PickerShareQuality, shareAudio: boolean) => Promise<void>;
      cancel: () => Promise<void>;
    };
  }
}

const list = document.querySelector<HTMLDivElement>('#source-list');
const status = document.querySelector<HTMLParagraphElement>('#status');
const cancelButton = document.querySelector<HTMLButtonElement>('#cancel');
const closeButton = document.querySelector<HTMLButtonElement>('#picker-close');
const confirmButton = document.querySelector<HTMLButtonElement>('#confirm');
const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab'));
const resolutionSelect = document.querySelector<HTMLSelectElement>('#quality-resolution');
const fpsSelect = document.querySelector<HTMLSelectElement>('#quality-fps');
const shareAudioCheckbox = document.querySelector<HTMLInputElement>('#share-audio');

let allSources: CaptureSourceView[] = [];
let activeKind: CaptureSourceView['kind'] = 'window';
let selectedId: string | null = null;

function renderSource(source: CaptureSourceView): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = `source ${source.id === selectedId ? 'selected' : ''}`;
  button.type = 'button';
  button.dataset.sourceId = source.id;

  const image = document.createElement('img');
  image.src = source.thumbnail;
  image.alt = '';

  const details = document.createElement('span');
  const name = document.createElement('strong');
  const kind = document.createElement('small');
  name.textContent = source.name;
  kind.textContent = source.kind === 'screen' ? 'Monitor' : 'Janela';
  details.append(name, kind);
  button.append(image, details);

  button.addEventListener('click', () => {
    selectedId = source.id;
    renderList();
  });
  return button;
}

function renderList(): void {
  if (!list) return;
  const filtered = allSources.filter((source) => source.kind === activeKind);
  if (filtered.length === 0) {
    list.textContent = activeKind === 'screen' ? 'Nenhum monitor disponível.' : 'Nenhum aplicativo disponível.';
  } else {
    list.replaceChildren(...filtered.map(renderSource));
  }
  if (confirmButton) confirmButton.disabled = !selectedId || !filtered.some((source) => source.id === selectedId);
}

async function loadSources(): Promise<void> {
  if (!list || !status) return;
  try {
    allSources = await window.capturePicker.listSources();
    status.remove();
    renderList();
  } catch {
    status.textContent = 'Não foi possível listar as fontes de captura.';
  }
}

function currentQuality(): PickerShareQuality {
  const resolution = resolutionSelect?.value ?? '720';
  const fps = fpsSelect?.value ?? '60';
  if (resolution === '1080') return '1080p60';
  return fps === '30' ? '720p30' : '720p60';
}

for (const tabButton of tabButtons) {
  tabButton.addEventListener('click', () => {
    activeKind = (tabButton.dataset.kind as CaptureSourceView['kind']) ?? 'window';
    for (const button of tabButtons) button.classList.toggle('active', button === tabButton);
    renderList();
  });
}

function syncFpsForResolution(): void {
  // 1080p só existe a 60 FPS no app — trava o seletor de FPS quando essa resolução é escolhida.
  if (!fpsSelect || !resolutionSelect) return;
  const is1080 = resolutionSelect.value === '1080';
  fpsSelect.disabled = is1080;
  if (is1080) fpsSelect.value = '60';
}
resolutionSelect?.addEventListener('change', syncFpsForResolution);
syncFpsForResolution();

// Botões de opção (chips) do Discord por cima dos <select> escondidos: clicar muda o select, e o estado
// ativo/desativado dos chips acompanha o select (1080p trava o FPS em 60).
const chipGroups = Array.from(document.querySelectorAll<HTMLDivElement>('.chip-group'));
function syncChips(): void {
  for (const group of chipGroups) {
    const select = document.getElementById(group.dataset.for ?? '') as HTMLSelectElement | null;
    if (!select) continue;
    for (const chip of Array.from(group.querySelectorAll<HTMLButtonElement>('.chip'))) {
      const active = chip.dataset.value === select.value;
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-checked', String(active));
      chip.disabled = select.disabled && !active;
    }
  }
}
for (const group of chipGroups) {
  group.addEventListener('click', (event) => {
    const chip = (event.target as HTMLElement).closest<HTMLButtonElement>('.chip');
    const select = document.getElementById(group.dataset.for ?? '') as HTMLSelectElement | null;
    if (!chip || !select || chip.disabled || !chip.dataset.value) return;
    select.value = chip.dataset.value;
    select.dispatchEvent(new Event('change'));
    syncChips();
  });
}
syncChips();

cancelButton?.addEventListener('click', () => void window.capturePicker.cancel());
closeButton?.addEventListener('click', () => void window.capturePicker.cancel());
confirmButton?.addEventListener('click', () => {
  if (!selectedId) return;
  if (confirmButton) confirmButton.disabled = true;
  void window.capturePicker.chooseSource(selectedId, currentQuality(), shareAudioCheckbox?.checked ?? true);
});

void loadSources();
