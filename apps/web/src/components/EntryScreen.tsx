import { type FormEvent, useEffect, useState } from 'react';
import { ACCENT_COLORS, type AccentColor, type UserSession } from '@nexplay/shared';
import { api } from '../api';
import { DESKTOP_DOWNLOAD_URL } from '../appLinks';
import { deepLinkUrl, peekPendingInvite } from '../pendingInvite';

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

  return (
    <main className="entry-screen">
      <section className="entry-window" aria-labelledby="entry-title">
        {pendingInvite && (
          <p className="entry-invite-banner" role="status">
            {registrationOpen
              ? 'Você recebeu um convite para um servidor. Entre na sua conta, ou crie uma, para aceitar.'
              : 'Você recebeu um convite para um servidor. Entre na sua conta, ou crie uma com o código de cadastro, para aceitar.'}
            {!window.desktop && pendingInviteCode && (
              <>
                {' '}
                <a href={deepLinkUrl(pendingInviteCode)}>Já tem o app instalado? Abrir no aplicativo</a>
              </>
            )}
          </p>
        )}
        <header className="entry-heading">
          <img className="brand-logo entry-logo" src="/logo-320.png" alt="" width="84" height="84" draggable={false} />
          <div>
            <h1 id="entry-title">NexPlay</h1>
            <p>Servidor privado</p>
          </div>
        </header>

        <div className="entry-mode-toggle" role="tablist" aria-label="Entrar ou cadastrar">
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>
            Entrar
          </button>
          <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>
            Criar conta
          </button>
        </div>

        <form className="entry-form" onSubmit={handleSubmit}>
          {notice && <div className="form-notice" role="status">{notice}</div>}

          <label htmlFor="username">Usuário</label>
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

          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 8 : undefined}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === 'register' ? 'Pelo menos 8 caracteres' : 'Sua senha'}
          />

          {mode === 'register' && (
            <>
              {!registrationOpen && (
                <>
                  <label htmlFor="inviteToken">Código de cadastro</label>
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
                <span className="spinner" aria-hidden="true" /> {mode === 'login' ? 'Entrando…' : 'Criando conta…'}
              </span>
            ) : mode === 'login' ? (
              'Entrar'
            ) : (
              'Criar conta e entrar'
            )}
          </button>
        </form>
        {!window.desktop && (
          <a className="entry-download" href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
            Baixar o app para Windows
          </a>
        )}
      </section>
    </main>
  );
}
