import { useState } from 'react';
import { AVATAR_FRAME_IDS, AVATAR_FRAME_LABELS, type AvatarFrame, type UserSession } from '@nexplay/shared';
import { api } from '../api';
import { Avatar } from './Workspace';
import { CheckIcon, StoreIcon } from './Icons';

// Descrição curta de cada borda, mostrada no cartão da Loja.
const FRAME_DESCRIPTIONS: Record<AvatarFrame, string> = {
  aurora: 'Azul e roxo girando devagar.',
  fogo: 'Laranja e amarelo, com brilho quente.',
  neon: 'Rosa e ciano bem fortes.',
  ouro: 'Dourado clássico.',
  'arco-iris': 'Todas as cores em volta.',
  gelo: 'Branco e azul-claro, com brilho frio.',
  pulso: 'Na cor de destaque, pulsando.',
  eletrico: 'Faíscas amarelas e azuis rápidas.',
};

// Loja no formato da do Discord. O NexPlay não cobra nada: os itens são as bordas de avatar,
// e "Usar" aplica a borda no perfil na hora (o mesmo que escolher em Meu perfil).
export function Store({ session, onFrameChanged }: { session: UserSession; onFrameChanged: (user: UserSession) => void }) {
  const [saving, setSaving] = useState<AvatarFrame | '' | null>(null);
  const [error, setError] = useState('');

  async function apply(frame: AvatarFrame | '') {
    if (saving !== null) return;
    setSaving(frame);
    setError('');
    try {
      const { user } = await api.updateProfile(
        session.accentColor,
        session.statusText,
        session.bio,
        session.pronouns,
        session.avatarUrl,
        { avatarFrame: frame },
      );
      onFrameChanged(user);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível trocar a borda agora.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="store-page">
      <header className="store-header">
        <StoreIcon size={20} />
        <h1>Loja</h1>
      </header>
      <div className="store-scroll">
        <section className="store-hero">
          <div>
            <h2>Bordas de avatar</h2>
            <p>Deixe sua foto com uma borda animada. Todas são grátis no NexPlay: é só escolher.</p>
          </div>
          <div className="store-hero-preview" aria-hidden="true">
            <Avatar name={session.displayName} accentColor={session.accentColor} avatarUrl={session.avatarUrl} frame={session.avatarFrame || 'aurora'} />
          </div>
        </section>

        {error && <p className="store-error" role="alert">{error}</p>}

        <div className="store-section-title">
          <h3>Todas as bordas</h3>
          {session.avatarFrame && (
            <button type="button" className="store-remove" onClick={() => void apply('')} disabled={saving !== null}>
              {saving === '' ? 'Removendo…' : 'Tirar borda'}
            </button>
          )}
        </div>
        <div className="store-grid">
          {AVATAR_FRAME_IDS.map((id) => {
            const inUse = session.avatarFrame === id;
            return (
              <article key={id} className={`store-card ${inUse ? 'in-use' : ''}`}>
                <div className={`store-card-preview store-preview-${id}`}>
                  <Avatar name={session.displayName} accentColor={session.accentColor} avatarUrl={session.avatarUrl} frame={id} />
                </div>
                <div className="store-card-body">
                  <strong>{AVATAR_FRAME_LABELS[id]}</strong>
                  <p>{FRAME_DESCRIPTIONS[id]}</p>
                  <div className="store-card-footer">
                    <span className="store-price">Grátis</span>
                    {inUse ? (
                      <span className="store-in-use"><CheckIcon size={14} /> Em uso</span>
                    ) : (
                      <button type="button" className="store-use" onClick={() => void apply(id)} disabled={saving !== null}>
                        {saving === id ? 'Aplicando…' : 'Usar'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
