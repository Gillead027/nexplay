import { useState } from 'react';
import {
  AVATAR_FRAME_IDS,
  AVATAR_FRAME_LABELS,
  NAMEPLATE_IDS,
  NAMEPLATE_LABELS,
  PROFILE_EFFECT_IDS,
  PROFILE_EFFECT_LABELS,
  PROFILE_THEME_PRESETS,
  type AvatarFrame,
  type Nameplate,
  type ProfileEffect,
  type UserCosmetics,
  type UserSession,
} from '@nexplay/shared';
import { api } from '../api';
import { useEscapeLayer } from '../escapeLayers';
import { Avatar } from './Workspace';
import { ProfileEffectLayer, profileThemeStyle } from './Cosmetics';
import { CheckIcon, CloseIcon, StoreIcon } from './Icons';

// Loja no formato da Loja do Discord: abas por tipo de item, cartões com prévia e uma janela de prévia ao clicar.
// No NexPlay tudo é grátis: "Usar" aplica o item no perfil na hora.

type Look = { avatarFrame: AvatarFrame | ''; cosmetics: UserCosmetics };
type Change = Partial<UserCosmetics> & { avatarFrame?: AvatarFrame | '' };

interface StoreItem {
  key: string;
  kind: 'decoration' | 'effect' | 'nameplate' | 'theme' | 'bundle';
  name: string;
  description: string;
  change: Change;
}

const KIND_LABELS: Record<StoreItem['kind'], string> = {
  decoration: 'Decoração de avatar',
  effect: 'Efeito de perfil',
  nameplate: 'Plaquinha de nome',
  theme: 'Tema de perfil',
  bundle: 'Pacote',
};

const FRAME_DESCRIPTIONS: Record<AvatarFrame, string> = {
  aurora: 'Azul e roxo girando devagar em volta da foto.',
  fogo: 'Laranja e amarelo, com brilho quente.',
  neon: 'Rosa e ciano bem fortes.',
  ouro: 'Dourado clássico.',
  'arco-iris': 'Todas as cores em volta.',
  gelo: 'Branco e azul-claro, com brilho frio.',
  pulso: 'Na cor de destaque, pulsando.',
  eletrico: 'Faíscas amarelas e azuis rápidas.',
};

const EFFECT_DESCRIPTIONS: Record<ProfileEffect, string> = {
  estrelas: 'Estrelas piscando no seu cartão de perfil.',
  neve: 'Flocos de neve caindo devagar.',
  chamas: 'Brasas subindo do pé do cartão.',
  coracoes: 'Corações subindo e sumindo.',
  confete: 'Confete colorido caindo.',
  bolhas: 'Bolhas de sabão subindo.',
  vagalumes: 'Pontinhos de luz flutuando.',
  petalas: 'Pétalas rosadas caindo em zigue-zague.',
};

const NAMEPLATE_DESCRIPTIONS: Record<Nameplate, string> = {
  cosmo: 'Nebulosa roxa com estrelas atrás do seu nome.',
  oceano: 'Ondas azuis se mexendo devagar.',
  'por-do-sol': 'Laranja e rosa de fim de tarde.',
  floresta: 'Verde de mata, com luz passando.',
  neon: 'Letreiro rosa e ciano de cidade à noite.',
  sakura: 'Rosa claro de cerejeira.',
  lava: 'Vermelho e laranja escorrendo.',
  glacial: 'Azul-gelo com brilho passando.',
};

// Pacotes: um conjunto de itens que combinam, aplicados juntos.
const BUNDLES: readonly { id: string; name: string; description: string; change: Change }[] = [
  { id: 'galaxia', name: 'Galáxia', description: 'Aurora, céu estrelado, plaquinha Cosmo e tema Meia-noite.', change: { avatarFrame: 'aurora', profileEffect: 'estrelas', nameplate: 'cosmo', themePrimary: '#1b2a6b', themeAccent: '#5865f2' } },
  { id: 'inverno', name: 'Inverno', description: 'Gelo, nevasca, plaquinha Glacial e tema Oceano.', change: { avatarFrame: 'gelo', profileEffect: 'neve', nameplate: 'glacial', themePrimary: '#0b3954', themeAccent: '#1fb5c9' } },
  { id: 'inferno', name: 'Inferno', description: 'Fogo, brasas, plaquinha Lava e tema Brasa.', change: { avatarFrame: 'fogo', profileEffect: 'chamas', nameplate: 'lava', themePrimary: '#7a1f12', themeAccent: '#f0a020' } },
  { id: 'primavera', name: 'Primavera', description: 'Arco-íris, pétalas, plaquinha Sakura e tema Algodão-doce.', change: { avatarFrame: 'arco-iris', profileEffect: 'petalas', nameplate: 'sakura', themePrimary: '#c94f9b', themeAccent: '#5bc0f8' } },
  { id: 'bosque', name: 'Bosque', description: 'Pulso, vaga-lumes, plaquinha Floresta e tema Floresta.', change: { avatarFrame: 'pulso', profileEffect: 'vagalumes', nameplate: 'floresta', themePrimary: '#163d22', themeAccent: '#57a05a' } },
  { id: 'festa', name: 'Festa', description: 'Neon, confete, plaquinha Cidade neon e tema Vinho.', change: { avatarFrame: 'neon', profileEffect: 'confete', nameplate: 'neon', themePrimary: '#4a0d2a', themeAccent: '#c2185b' } },
];

const ITEMS: StoreItem[] = [
  ...AVATAR_FRAME_IDS.map((id): StoreItem => ({ key: `decoration-${id}`, kind: 'decoration', name: AVATAR_FRAME_LABELS[id], description: FRAME_DESCRIPTIONS[id], change: { avatarFrame: id } })),
  ...PROFILE_EFFECT_IDS.map((id): StoreItem => ({ key: `effect-${id}`, kind: 'effect', name: PROFILE_EFFECT_LABELS[id], description: EFFECT_DESCRIPTIONS[id], change: { profileEffect: id } })),
  ...NAMEPLATE_IDS.map((id): StoreItem => ({ key: `nameplate-${id}`, kind: 'nameplate', name: NAMEPLATE_LABELS[id], description: NAMEPLATE_DESCRIPTIONS[id], change: { nameplate: id } })),
  ...PROFILE_THEME_PRESETS.map((theme): StoreItem => ({ key: `theme-${theme.id}`, kind: 'theme', name: theme.label, description: 'As duas cores do seu cartão de perfil.', change: { themePrimary: theme.primary, themeAccent: theme.accent } })),
  ...BUNDLES.map((bundle): StoreItem => ({ key: `bundle-${bundle.id}`, kind: 'bundle', name: bundle.name, description: bundle.description, change: bundle.change })),
];

// Um item de cada tipo para a vitrine de Destaques.
const FEATURED_KEYS = ['bundle-galaxia', 'effect-estrelas', 'nameplate-cosmo', 'decoration-aurora', 'theme-meia-noite', 'bundle-inverno', 'effect-confete', 'nameplate-neon'];

type Tab = 'featured' | StoreItem['kind'];
const TABS: { id: Tab; label: string }[] = [
  { id: 'featured', label: 'Destaques' },
  { id: 'decoration', label: 'Decorações de avatar' },
  { id: 'effect', label: 'Efeitos de perfil' },
  { id: 'nameplate', label: 'Plaquinhas de nome' },
  { id: 'theme', label: 'Temas de perfil' },
  { id: 'bundle', label: 'Pacotes' },
];

function currentLook(session: UserSession): Look {
  return {
    avatarFrame: session.avatarFrame,
    cosmetics: session.cosmetics ?? { profileEffect: '', nameplate: '', themePrimary: '', themeAccent: '' },
  };
}

function applyChange(look: Look, change: Change): Look {
  const { avatarFrame, ...cosmetics } = change;
  return { avatarFrame: avatarFrame ?? look.avatarFrame, cosmetics: { ...look.cosmetics, ...cosmetics } };
}

// "Em uso" quando tudo o que o item muda já está igual no perfil.
function isEquipped(look: Look, change: Change): boolean {
  const { avatarFrame, ...cosmetics } = change;
  if (avatarFrame !== undefined && look.avatarFrame !== avatarFrame) return false;
  return (Object.keys(cosmetics) as (keyof UserCosmetics)[]).every((key) => look.cosmetics[key] === cosmetics[key]);
}

// O que tirar quando a pessoa desiste do item.
function removalFor(change: Change): Change {
  const removal: Change = {};
  if (change.avatarFrame !== undefined) removal.avatarFrame = '';
  if (change.profileEffect !== undefined) removal.profileEffect = '';
  if (change.nameplate !== undefined) removal.nameplate = '';
  if (change.themePrimary !== undefined || change.themeAccent !== undefined) {
    removal.themePrimary = '';
    removal.themeAccent = '';
  }
  return removal;
}

function ProfileMock({ session, look, large = false }: { session: UserSession; look: Look; large?: boolean }) {
  const themeStyle = profileThemeStyle(look.cosmetics);
  return (
    <div className={`store-profile-mock ${themeStyle ? 'themed' : ''} ${large ? 'large' : ''}`} style={themeStyle}>
      <ProfileEffectLayer effect={look.cosmetics.profileEffect} />
      <div className="store-mock-banner" />
      <div className="store-mock-avatar">
        <Avatar name={session.displayName} accentColor={session.accentColor} avatarUrl={session.avatarUrl} frame={look.avatarFrame} />
      </div>
      <div className="store-mock-body">
        <strong>{session.displayName}</strong>
        {large && <span>{session.statusText || 'Personalizando o perfil na Loja'}</span>}
        <i className="store-mock-line" />
        <i className="store-mock-line short" />
      </div>
    </div>
  );
}

function NameplateMock({ session, look }: { session: UserSession; look: Look }) {
  const nameplate = look.cosmetics.nameplate;
  return (
    <div className={`member-row online store-nameplate-mock ${nameplate ? `has-nameplate nameplate-${nameplate}` : ''}`}>
      {nameplate && <span className="nameplate-art" aria-hidden="true" />}
      <span className="member-avatar">
        <Avatar name={session.displayName} accentColor={session.accentColor} avatarUrl={session.avatarUrl} frame={look.avatarFrame} />
        <span className="member-status-dot" aria-hidden="true" />
      </span>
      <span className="member-copy"><strong>{session.displayName}</strong></span>
    </div>
  );
}

function ItemPreview({ item, session, look }: { item: StoreItem; session: UserSession; look: Look }) {
  if (item.kind === 'decoration') {
    return (
      <div className={`store-card-preview store-preview-${item.change.avatarFrame}`}>
        <Avatar name={session.displayName} accentColor={session.accentColor} avatarUrl={session.avatarUrl} frame={item.change.avatarFrame} />
      </div>
    );
  }
  if (item.kind === 'nameplate') {
    return (
      <div className="store-card-preview store-preview-nameplate">
        <NameplateMock session={session} look={applyChange({ avatarFrame: '', cosmetics: look.cosmetics }, { nameplate: item.change.nameplate ?? '' })} />
      </div>
    );
  }
  // Efeito, tema e pacote: o cartão de perfil com o item aplicado (efeito e tema sozinhos não herdam o resto).
  const base: Look = item.kind === 'bundle' ? look : { avatarFrame: '', cosmetics: { profileEffect: '', nameplate: '', themePrimary: '', themeAccent: '' } };
  return (
    <div className="store-card-preview store-preview-profile">
      <ProfileMock session={session} look={applyChange(base, item.change)} />
    </div>
  );
}

function PreviewModal({
  item,
  session,
  look,
  saving,
  onApply,
  onClose,
}: {
  item: StoreItem;
  session: UserSession;
  look: Look;
  saving: boolean;
  onApply: (change: Change) => void;
  onClose: () => void;
}) {
  useEscapeLayer(true, onClose);
  const equipped = isEquipped(look, item.change);
  const previewLook = applyChange(look, item.change);
  return (
    <div className="dialog-overlay store-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="store-modal" role="dialog" aria-modal="true" aria-label={item.name}>
        <button type="button" className="store-modal-close" onClick={onClose} aria-label="Fechar"><CloseIcon size={20} /></button>
        <div className="store-modal-preview">
          <ProfileMock session={session} look={previewLook} large />
          <div className="store-modal-member">
            <span>Na lista de membros</span>
            <NameplateMock session={session} look={previewLook} />
          </div>
        </div>
        <div className="store-modal-info">
          <span className="store-modal-kind">{KIND_LABELS[item.kind]}</span>
          <h2>{item.name}</h2>
          <p>{item.description}</p>
          <span className="store-price large">Grátis</span>
          <div className="store-modal-actions">
            {equipped ? (
              <>
                <span className="store-in-use"><CheckIcon size={16} /> Em uso</span>
                <button type="button" className="store-remove" disabled={saving} onClick={() => onApply(removalFor(item.change))}>
                  {saving ? 'Tirando…' : 'Tirar'}
                </button>
              </>
            ) : (
              <button type="button" className="store-use large" disabled={saving} onClick={() => onApply(item.change)}>
                {saving ? 'Aplicando…' : item.kind === 'bundle' ? 'Usar o pacote' : 'Usar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomThemeCard({ session, look, saving, onApply }: { session: UserSession; look: Look; saving: boolean; onApply: (change: Change) => void }) {
  const [primary, setPrimary] = useState(look.cosmetics.themePrimary || '#5865f2');
  const [accent, setAccent] = useState(look.cosmetics.themeAccent || '#eb459f');
  return (
    <article className="store-card store-custom-theme">
      <div className="store-card-preview store-preview-profile">
        <ProfileMock session={session} look={applyChange({ avatarFrame: '', cosmetics: look.cosmetics }, { profileEffect: '', nameplate: '', themePrimary: primary, themeAccent: accent })} />
      </div>
      <div className="store-card-body">
        <strong>Suas cores</strong>
        <div className="store-color-row">
          <label>Principal<input type="color" value={primary} onChange={(event) => setPrimary(event.target.value)} /></label>
          <label>Destaque<input type="color" value={accent} onChange={(event) => setAccent(event.target.value)} /></label>
        </div>
        <div className="store-card-footer">
          <span className="store-price">Grátis</span>
          <button type="button" className="store-use" disabled={saving} onClick={() => onApply({ themePrimary: primary, themeAccent: accent })}>Usar</button>
        </div>
      </div>
    </article>
  );
}

export function Store({ session, onUserChanged }: { session: UserSession; onUserChanged: (user: UserSession) => void }) {
  const [tab, setTab] = useState<Tab>('featured');
  const [selected, setSelected] = useState<StoreItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const look = currentLook(session);

  async function apply(change: Change) {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const { user } = await api.updateCosmetics(change);
      onUserChanged(user);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível aplicar o item agora.');
    } finally {
      setSaving(false);
    }
  }

  const items = tab === 'featured'
    ? FEATURED_KEYS.map((key) => ITEMS.find((item) => item.key === key)!).filter(Boolean)
    : ITEMS.filter((item) => item.kind === tab);
  const anyEquipped = Boolean(look.avatarFrame || look.cosmetics.profileEffect || look.cosmetics.nameplate || look.cosmetics.themePrimary);

  return (
    <div className="store-page">
      <header className="store-header">
        <div className="store-header-title"><StoreIcon size={20} /><h1>Loja</h1></div>
        <span className="friends-header-divider" aria-hidden="true" />
        <nav className="store-tabs" role="tablist" aria-label="Categorias da Loja">
          {TABS.map((entry) => (
            <button key={entry.id} type="button" role="tab" aria-selected={tab === entry.id} className={tab === entry.id ? 'active' : ''} onClick={() => setTab(entry.id)}>
              {entry.label}
            </button>
          ))}
        </nav>
      </header>
      <div className="store-scroll">
        {tab === 'featured' && (
          <section className="store-hero">
            <div>
              <span className="store-hero-kicker">Tudo grátis no NexPlay</span>
              <h2>Deixe seu perfil com a sua cara</h2>
              <p>Decorações de avatar, efeitos no cartão de perfil, plaquinhas na lista de membros e temas de cores. Clique em um item para ver como fica em você.</p>
            </div>
            <div className="store-hero-preview" aria-hidden="true">
              <ProfileMock session={session} look={applyChange(look, BUNDLES[0]!.change)} />
            </div>
          </section>
        )}

        {error && <p className="store-error" role="alert">{error}</p>}

        <div className="store-section-title">
          <h3>{TABS.find((entry) => entry.id === tab)?.label}</h3>
          {anyEquipped && (
            <button type="button" className="store-remove" disabled={saving}
              onClick={() => void apply({ avatarFrame: '', profileEffect: '', nameplate: '', themePrimary: '', themeAccent: '' })}>
              Tirar tudo
            </button>
          )}
        </div>
        <div className={`store-grid ${tab === 'nameplate' ? 'wide' : ''}`}>
          {tab === 'theme' && <CustomThemeCard session={session} look={look} saving={saving} onApply={(change) => void apply(change)} />}
          {items.map((item) => {
            const equipped = isEquipped(look, item.change);
            return (
              <button key={item.key} type="button" className={`store-card store-kind-${item.kind} ${equipped ? 'in-use' : ''}`} onClick={() => setSelected(item)}>
                <ItemPreview item={item} session={session} look={look} />
                <div className="store-card-body">
                  {tab === 'featured' && <span className="store-card-kind">{KIND_LABELS[item.kind]}</span>}
                  <strong>{item.name}</strong>
                  <p>{item.description}</p>
                  <div className="store-card-footer">
                    <span className="store-price">Grátis</span>
                    {equipped && <span className="store-in-use"><CheckIcon size={14} /> Em uso</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      {selected && (
        <PreviewModal item={selected} session={session} look={look} saving={saving}
          onApply={(change) => void apply(change)} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
