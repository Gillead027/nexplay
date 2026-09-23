import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSelfHarmAdapter } from './selfHarmAdapter.js';

// SELF_HARM_VENDOR não é definido no .env de desenvolvimento usado por esta suíte, então o
// padrão 'none' se aplica — o estado esperado em qualquer instância sem Azure configurado.
test('getSelfHarmAdapter() devolve o adapter desligado quando SELF_HARM_VENDOR=none', async () => {
  const adapter = getSelfHarmAdapter();
  assert.equal(adapter.vendor, 'none');
  assert.equal(await adapter.classifyText('qualquer texto'), null);
});
