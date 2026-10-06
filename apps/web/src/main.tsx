import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { bootPerfMode } from './perfMode';
import { bootTheme } from './theme';
import { bootDensity } from './density';
import { bootAppearancePrefs } from './appearancePrefs';
import { migrateLegacyStorageKeys } from './legacyStorageMigration';
import { installRangeFill } from './rangeFill';
import { native } from './native';
import { extractDeepLinkInvite, extractInviteCode, PENDING_INVITE_EVENT, savePendingInvite } from './pendingInvite';
import './styles.css';
import './design.css';
import './discord.css';

// Link de convite (/convite/CÓDIGO): guarda o código e volta para o endereço normal. Depois de
// entrar (ou criar a conta) a pessoa é levada ao servidor.
const inviteCode = extractInviteCode(window.location.pathname);
if (inviteCode) {
  savePendingInvite(inviteCode);
  window.history.replaceState(null, '', '/');
}

// App desktop 0.2.13 em diante: clicar num link nexplay://convite/... entrega o código aqui.
native()?.deepLink.onLink((url) => {
  const code = extractDeepLinkInvite(url);
  if (!code) return;
  savePendingInvite(code);
  window.dispatchEvent(new Event(PENDING_INVITE_EVENT));
});

// "Modo teclado" do Discord: o anel de foco só aparece depois de navegar com Tab, e some no primeiro clique.
// Sem isso, fechar uma janela com Esc devolvia o foco a um botão e ele ficava com o anel azul.
window.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') document.documentElement.dataset.keyboard = 'true';
}, true);
window.addEventListener('pointerdown', () => {
  delete document.documentElement.dataset.keyboard;
}, true);

migrateLegacyStorageKeys();
bootPerfMode();
bootTheme();
bootDensity();
bootAppearancePrefs();
installRangeFill();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
