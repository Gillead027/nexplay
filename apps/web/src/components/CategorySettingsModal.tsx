import { useId, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { CATEGORY_NAME_MAX_LENGTH, type Category } from '@nexplay/shared';
import { api } from '../api';

export interface CategorySettingsModalHandle {
  open: () => void;
}

// Sem botão próprio: aberto pelo item "Editar categoria" do menu de
// contexto (ver Workspace.tsx) — por isso expõe open() via ref em vez do
// padrão showModal-no-onClick usado nos outros diálogos deste app.
export const CategorySettingsModal = forwardRef<CategorySettingsModalHandle, {
  category: Category;
  serverId: string;
  onUpdated: (category: Category) => void;
}>(function CategorySettingsModal({ category, serverId, onUpdated }, ref) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [name, setName] = useState(category.name);
  const [staffOnly, setStaffOnly] = useState(category.staffOnly);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useImperativeHandle(ref, () => ({
    open: () => {
      setName(category.name);
      setStaffOnly(category.staffOnly);
      setError('');
      dialog.current?.showModal();
    },
  }));

  async function save() {
    if (saving || !name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const result = await api.updateCategory(serverId, category.id, { name: name.trim(), staffOnly });
      onUpdated(result.category);
      dialog.current?.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a categoria.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialog} className="channel-dialog category-settings-dialog" aria-labelledby={titleId}
      onCancel={(event) => { if (saving) event.preventDefault(); }}>
      <header><h2 id={titleId}>Editar categoria</h2></header>
      <label htmlFor={`${titleId}-name`}>Nome da categoria</label>
      <input id={`${titleId}-name`} value={name} maxLength={CATEGORY_NAME_MAX_LENGTH}
        onChange={(event) => setName(event.target.value)} />
      <label className="toggle-row">
        <span>Categoria restrita à staff</span>
        <input type="checkbox" checked={staffOnly} onChange={(event) => setStaffOnly(event.target.checked)} />
      </label>
      <small>Só membros com algum cargo de moderação/administração veem esta categoria e seus canais.</small>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer>
        <button type="button" className="dialog-cancel" disabled={saving} onClick={() => dialog.current?.close()}>Cancelar</button>
        <button type="button" className="primary-button" disabled={saving || !name.trim()} onClick={() => void save()}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </footer>
    </dialog>
  );
});
