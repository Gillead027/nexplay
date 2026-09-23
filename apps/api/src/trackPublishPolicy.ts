import type { IdentityVerificationStatus } from '@nexplay/shared';

// Decisão pura (sem chamar o LiveKit nem o banco) de se uma faixa de câmera/tela recém-
// publicada deve ser mutada por falta de verificação — extraída do handler do webhook em
// index.ts pra dar pra testar sem precisar assinar um payload de webhook de verdade. Fica
// num arquivo próprio, sem nenhuma outra dependência, no mesmo espírito de
// voiceModeration.ts: uma decisão pura e testada isoladamente, junto do efeito colateral
// (mutePublishedTrack) só no chamador.
export function shouldMuteUnverifiedTrackPublish(input: {
  identityVerificationRequired: boolean;
  isCameraOrScreenShare: boolean;
  publisherStatus: IdentityVerificationStatus | undefined;
}): boolean {
  if (!input.identityVerificationRequired) return false;
  if (!input.isCameraOrScreenShare) return false;
  return input.publisherStatus !== 'verified';
}
