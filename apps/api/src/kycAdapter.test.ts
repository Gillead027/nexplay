import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getKycAdapter, KycDisabledError } from './kycAdapter.js';

// KYC_VENDOR não é definido no .env de desenvolvimento usado por esta suíte, então o padrão
// 'none' se aplica — exatamente o estado esperado em qualquer instância que ainda não
// contratou um vendor de verificação de identidade.
test('getKycAdapter() devolve o adapter desligado quando KYC_VENDOR=none', async () => {
  const adapter = getKycAdapter();
  assert.equal(adapter.vendor, 'none');
  await assert.rejects(() => adapter.startVerification({ userId: 'u1', username: 'alguém' }), KycDisabledError);
  assert.equal(adapter.verifyWebhookSignature(Buffer.from('{}'), {}), false);
  assert.equal(adapter.parseWebhookEvent(Buffer.from('{}')), null);
});
