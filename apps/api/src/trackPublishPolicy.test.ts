import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldMuteUnverifiedTrackPublish } from './trackPublishPolicy.js';

test('nunca muta quando IDENTITY_VERIFICATION_REQUIRED está desligado', () => {
  assert.equal(
    shouldMuteUnverifiedTrackPublish({ identityVerificationRequired: false, isCameraOrScreenShare: true, publisherStatus: 'unverified' }),
    false,
  );
});

test('nunca muta faixa que não é câmera/tela (ex.: microfone)', () => {
  assert.equal(
    shouldMuteUnverifiedTrackPublish({ identityVerificationRequired: true, isCameraOrScreenShare: false, publisherStatus: 'unverified' }),
    false,
  );
});

test('muta câmera/tela de quem não está verificado', () => {
  for (const status of ['unverified', 'pending', 'rejected', undefined] as const) {
    assert.equal(
      shouldMuteUnverifiedTrackPublish({ identityVerificationRequired: true, isCameraOrScreenShare: true, publisherStatus: status }),
      true,
      `status ${status} deveria mutar`,
    );
  }
});

test('nunca muta quem está verificado', () => {
  assert.equal(
    shouldMuteUnverifiedTrackPublish({ identityVerificationRequired: true, isCameraOrScreenShare: true, publisherStatus: 'verified' }),
    false,
  );
});
