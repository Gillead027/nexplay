import { type FormEvent, useEffect, useState } from 'react';
import { ACCENT_COLORS, type AccentColor, type UserSession } from '@nexplay/shared';
import { api } from '../api';
import { DESKTOP_DOWNLOAD_URL } from '../appLinks';
import { deepLinkUrl, peekPendingInvite } from '../pendingInvite';
import { DownloadIcon } from './Icons';

interface EntryScreenProps {
  onAuthenticated: (session: UserSession) => void | Promise<void>;
  // Explica por que a pessoa caiu aqui sem ter pedido (ex.: sessão expirada).
  notice?: string | undefined;
}

type Mode = 'login' | 'register';

export function EntryScreen({ onAuthenticated, notice }: EntryScreenProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [accentColor, setAccentColor] = useState<AccentColor>(ACCENT_COLORS[0]);
  const pendingInviteCode = peekPendingInvite();
  const pendingInvite = pendingInviteCode !== null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Cadastro aberto: sem o campo do código. Até o servidor responder (ou se falhar) o campo aparece;
  // quem decide é sempre o servidor.
  const [registrationOpen, setRegistrationOpen] = useState(false);

  useEffect(() => {
    let active = true;
    api.getRegistrationConfig().then(({ open }) => { if (active) setRegistrationOpen(open); }).catch(() => {});
    return () => { active = false; };
  }, []);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { user } =
        mode === 'login'
          ? await api.login(username, password)
          : await api.register(username, password, registrationOpen ? undefined : inviteToken, accentColor);
      await onAuthenticated(user);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  const login = mode === 'login';
  // O app desktop já é o aplicativo: só o navegador mostra a coluna do download.
  const inBrowser = !window.desktop;

  return (
    <main className="entry-screen">
      <div className="entry-backdrop" aria-hidden="true">
        <img className="entry-ghost a" src="/logo-320.png" alt="" draggable={false} />
        <img className="entry-ghost b" src="/logo-320.png" alt="" draggable={false} />
        <span className="entry-sparkle" />
        <span className="entry-sparkle" />
        <span className="entry-sparkle" />
        <span className="entry-sparkle" />
        <span className="entry-sparkle" />
        <span className="entry-sparkle" />
      </div>

      <header className="entry-brand">
        <img className="brand-logo" src="/logo-320.png" alt="" width="40" height="40" draggable={false} />
        <span>NexPlay</span>
      </header>

      <section className={`entry-window ${inBrowser ? '' : 'single'}`} aria-labelledby="entry-title">
        <div className="entry-main">
          {pendingInvite && (
            <p className="entry-invite-banner" role="status">
              {registrationOpen
                ? 'Você recebeu um convite para um servidor. Entre na sua conta, ou crie uma, para aceitar.'
                : 'Você recebeu um convite para um servidor. Entre na sua conta, ou crie uma com o código de cadastro, para aceitar.'}
              {inBrowser && pendingInviteCode && (
                <>
                  {' '}
                  <a href={deepLinkUrl(pendingInviteCode)}>Já tem o app instalado? Abrir no aplicativo</a>
                </>
              )}
            </p>
          )}

          <h1 id="entry-title">{login ? 'Boas-vindas de volta!' : 'Criar uma conta'}</h1>
          <p className="entry-lead">
            {login ? 'Estamos felizes em te ver de novo.' : 'Escolha um usuário e uma senha.'}
          </p>

          <form className="entry-form" onSubmit={handleSubmit}>
            {notice && <div className="form-notice" role="status">{notice}</div>}

            <label htmlFor="username">Usuário<span className="required" aria-hidden="true">*</span></label>
            <input
              id="username"
              autoComplete="username"
              minLength={2}
              maxLength={24}
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Seu nome de usuário"
            />

            <label htmlFor="password">Senha<span className="required" aria-hidden="true">*</span></label>
            <input
              id="password"
              type="password"
              autoComplete={login ? 'current-password' : 'new-password'}
              minLength={login ? undefined : 8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={login ? 'Sua senha' : 'Pelo menos 8 caracteres'}
            />

            {!login && (
              <>
                {!registrationOpen && (
                  <>
                    <label htmlFor="inviteToken">Código de cadastro<span className="required" aria-hidden="true">*</span></label>
                    <input
                      id="inviteToken"
                      type="password"
                      autoComplete="off"
                      required
                      value={inviteToken}
                      onChange={(event) => setInviteToken(event.target.value)}
                      placeholder="Código para criar a conta"
                    />
                  </>
                )}

                <label htmlFor="accent-color-picker">Cor do perfil</label>
                <div className="accent-picker" id="accent-color-picker" role="radiogroup" aria-label="Cor do perfil">
                  {ACCENT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      role="radio"
                      aria-checked={accentColor === color}
                      aria-label={`Cor ${color}`}
                      className={`accent-swatch ${accentColor === color ? 'selected' : ''}`}
                      data-color={color}
                      onClick={() => setAccentColor(color)}
                    />
                  ))}
                </div>
              </>
            )}

            {error && <div className="form-error" role="alert">{error}</div>}

            <button className="primary-button entry-submit" type="submit" disabled={loading}>
              {loading ? (
                <span className="button-spinner-row">
                  <span className="spinner" aria-hidden="true" /> {login ? 'Entrando…' : 'Criando conta…'}
                </span>
              ) : login ? (
                'Entrar'
              ) : (
                'Criar conta e entrar'
              )}
            </button>
          </form>

          <p className="entry-switch">
            {login ? 'Precisando de uma conta?' : 'Já tem uma conta?'}{' '}
            <button type="button" onClick={() => switchMode(login ? 'register' : 'login')}>
              {login ? 'Registre-se' : 'Entrar'}
            </button>
          </p>
        </div>

        {inBrowser && (
          <aside className="entry-side" aria-label="Aplicativo para Windows">
            <img className="brand-logo entry-side-logo" src="/logo-320.png" alt="" width="132" height="132" draggable={false} />
            <h2>Use o app no computador</h2>
            <p>O aplicativo se atualiza sozinho e deixa você escolher qual janela transmitir, com o áudio dela.</p>
            <a className="entry-download-button" href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
              <DownloadIcon size={18} /> Baixar para Windows
            </a>
          </aside>
        )}
      </section>
    </main>
  );
}
