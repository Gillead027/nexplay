import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { bootPerfMode } from './perfMode';
import { bootTheme } from './theme';
import { bootDensity } from './density';
import { bootAppearancePrefs } from './appearancePrefs';
import { migrateLegacyStorageKeys } from './legacyStorageMigration';
import { extractInviteCode, savePendingInvite } from './pendingInvite';
import './styles.css';

// Link de convite (/convite/CÓDIGO): guarda o código e volta para o endereço normal. Depois de
// entrar (ou criar a conta) a pessoa é levada ao servidor.
const inviteCode = extractInviteCode(window.location.pathname);
if (inviteCode) {
  savePendingInvite(inviteCode);
  window.history.replaceState(null, '', '/');
}

migrateLegacyStorageKeys();
bootPerfMode();
bootTheme();
bootDensity();
bootAppearancePrefs();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
