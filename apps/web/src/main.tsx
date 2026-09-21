import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { bootPerfMode } from './perfMode';
import { bootTheme } from './theme';
import { bootDensity } from './density';
import { bootAppearancePrefs } from './appearancePrefs';
import { migrateLegacyStorageKeys } from './legacyStorageMigration';
import { installRangeFill } from './rangeFill';
import { extractDeepLinkInvite, extractInviteCode, PENDING_INVITE_EVENT, savePendingInvite } from './pendingInvite';
import './styles.css';
import './design.css';

// Link de convite (/convite/CÓDIGO): guarda o código e volta para o endereço normal. Depois de
// entrar (ou criar a conta) a pessoa é levada ao servidor.
const inviteCode = extractInviteCode(window.location.pathname);
if (inviteCode) {
  savePendingInvite(inviteCode);
  window.history.replaceState(null, '', '/');
}

// App desktop 0.2.13 em diante: clicar num link nexplay://convite/... entrega o código aqui.
window.desktop?.onDeepLink?.((url) => {
  const code = extractDeepLinkInvite(url);
  if (!code) return;
  savePendingInvite(code);
  window.dispatchEvent(new Event(PENDING_INVITE_EVENT));
});

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
