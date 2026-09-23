import type { IncomingHttpHeaders } from 'node:http';
import { config } from './config.js';

export interface KycStartResult {
  redirectUrl: string;
  vendorSessionRef: string;
}

export interface KycWebhookResult {
  vendorSessionRef: string;
  status: 'verified' | 'rejected';
  failureReason: string;
}

export interface KycAdapter {
  readonly vendor: string;
  startVerification(input: { userId: string; username: string }): Promise<KycStartResult>;
  verifyWebhookSignature(rawBody: Buffer, headers: IncomingHttpHeaders): boolean;
  parseWebhookEvent(rawBody: Buffer): KycWebhookResult | null;
}

// Sinaliza "recurso desligado nesta instância" pras rotas devolverem 501 em vez de um erro
// genérico — KYC_VENDOR=none é o padrão até um admin configurar um vendor de propósito.
export class KycDisabledError extends Error {
  constructor() {
    super('Verificação de identidade não está configurada nesta instância.');
    this.name = 'KycDisabledError';
  }
}

class DisabledKycAdapter implements KycAdapter {
  readonly vendor = 'none';

  async startVerification(): Promise<KycStartResult> {
    throw new KycDisabledError();
  }

  verifyWebhookSignature(): boolean {
    return false;
  }

  parseWebhookEvent(): KycWebhookResult | null {
    return null;
  }
}

// Só 'none' tem implementação real hoje — os outros vendors do enum documentam a intenção
// (ver README/plano de segurança), mas exigem escrever o adapter de verdade em cima da API
// específica do vendor contratado antes de configurar KYC_VENDOR com esse valor.
export function getKycAdapter(): KycAdapter {
  if (config.KYC_VENDOR === 'none') return new DisabledKycAdapter();
  throw new Error(
    `KYC_VENDOR "${config.KYC_VENDOR}" ainda não tem adapter implementado — adicione a integração real em apps/api/src/kycAdapter.ts antes de configurar esse vendor.`,
  );
}
