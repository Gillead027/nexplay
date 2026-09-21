import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';

function logUpdate(line: string): void {
  const entry = `[${new Date().toISOString()}] ${line}\n`;
  console.log(entry.trim());
  try {
    appendFileSync(join(app.getPath('userData'), 'updater.log'), entry, 'utf8');
  } catch {
    // Se não der pra gravar o log, seguimos sem travar o fluxo de atualização.
  }
}

// Resposta da verificação pedida pela pessoa na tela Configurações > Sobre.
export type UpdateCheckOutcome =
  | { status: 'unavailable'; message: string }
  | { status: 'up-to-date'; version: string }
  | { status: 'available'; version: string }
  | { status: 'error'; message: string };

// Verifica agora, sem esperar o próximo boot. Se houver versão nova o download começa sozinho
// (autoDownload) e, quando termina, o diálogo de "Atualizar e reiniciar" de initAutoUpdater aparece.
export async function checkForUpdatesNow(): Promise<UpdateCheckOutcome> {
  if (!app.isPackaged) return { status: 'unavailable', message: 'A verificação só existe no aplicativo instalado.' };
  try {
    logUpdate('Verificação pedida pela pessoa (Configurações > Sobre).');
    // Quem pede a verificação quer ver o aviso, mesmo que já tenha dito "Depois" para essa versão.
    promptedVersion = null;
    const result = await autoUpdater.checkForUpdates();
    if (!result) return { status: 'unavailable', message: 'As atualizações estão desativadas nesta instalação.' };
    return result.isUpdateAvailable
      ? { status: 'available', version: result.updateInfo.version }
      : { status: 'up-to-date', version: app.getVersion() };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

// Com o app escondido na bandeja ele quase nunca reinicia, então a verificação de atualização se repete sozinha.
const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
// A versão para a qual o aviso "Atualizar e reiniciar" já foi mostrado nesta execução: a verificação repetida
// baixa/reconhece a mesma versão de novo e não deve perguntar de quatro em quatro horas.
let promptedVersion: string | null = null;

export function initAutoUpdater(): void {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  logUpdate(`Iniciando verificação. Versão atual: ${app.getVersion()}`);
  autoUpdater.on('checking-for-update', () => logUpdate('Verificando atualização…'));
  autoUpdater.on('update-available', (info) => logUpdate(`Atualização encontrada: ${info.version}`));
  autoUpdater.on('update-not-available', (info) => logUpdate(`Nenhuma atualização disponível (última: ${info.version}).`));
  autoUpdater.on('download-progress', (progress) => logUpdate(`Baixando… ${Math.round(progress.percent)}%`));
  autoUpdater.on('update-downloaded', (info) => logUpdate(`Download concluído: ${info.version}`));

  autoUpdater.on('error', (error) => {
    logUpdate(`ERRO: ${error.message}`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (promptedVersion === info.version) return;
    promptedVersion = info.version;
    void dialog
      .showMessageBox({
        type: 'info',
        title: 'Atualização disponível',
        message: `Uma nova versão do NexPlay (${info.version}) está pronta.`,
        detail: 'Deseja reiniciar agora para aplicar a atualização?',
        buttons: ['Atualizar e reiniciar', 'Depois'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });

  void autoUpdater.checkForUpdates();
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((error: unknown) => logUpdate(`ERRO na verificação periódica: ${String(error)}`));
  }, RECHECK_INTERVAL_MS).unref();
}
