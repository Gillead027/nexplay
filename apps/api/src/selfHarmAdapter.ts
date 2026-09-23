import { AzureKeyCredential } from '@azure/core-auth';
import ContentSafetyClient, { isUnexpected } from '@azure-rest/ai-content-safety';
import { config } from './config.js';

export interface SelfHarmClassification {
  // Escala 0-7 do Azure Content Safety (EightSeverityLevels) — quanto maior, mais grave.
  severity: number;
}

export interface SelfHarmAdapter {
  readonly vendor: string;
  classifyText(text: string): Promise<SelfHarmClassification | null>;
}

class DisabledSelfHarmAdapter implements SelfHarmAdapter {
  readonly vendor = 'none';

  async classifyText(): Promise<SelfHarmClassification | null> {
    return null;
  }
}

// Usa o SDK REST oficial da Microsoft (@azure-rest/ai-content-safety). Nível F0 do Azure é
// gratuito até 5.000 textos/mês — acima disso o Azure só para de processar, não cobra.
class AzureContentSafetyAdapter implements SelfHarmAdapter {
  readonly vendor = 'azure-content-safety';

  constructor(
    private readonly apiKey: string,
    private readonly endpoint: string,
  ) {}

  async classifyText(text: string): Promise<SelfHarmClassification | null> {
    try {
      const client = ContentSafetyClient(this.endpoint, new AzureKeyCredential(this.apiKey));
      const result = await client.path('/text:analyze').post({
        body: { text, outputType: 'EightSeverityLevels' },
      });
      if (isUnexpected(result)) {
        console.error('Azure Content Safety devolveu um erro:', result.body);
        return null;
      }
      const selfHarm = result.body.categoriesAnalysis.find((item) => item.category === 'SelfHarm');
      return selfHarm ? { severity: selfHarm.severity ?? 0 } : null;
    } catch (error) {
      // Rede fora do ar, timeout, chave inválida etc. — segurança de conteúdo nunca pode ser
      // motivo de mensagem não enviada, então qualquer falha aqui é "não detectou nada".
      console.error('Falha ao classificar texto com Azure Content Safety:', error);
      return null;
    }
  }
}

// Só instanciado quando alguém de fato manda uma mensagem (ver textChannels.ts/dmChannels.ts) —
// não é chamado no boot, então uma chave inválida não derruba o processo, só faz esse texto
// específico não ser classificado (mesma filosofia "falha aqui não derruba o app" do storage.ts).
export function getSelfHarmAdapter(): SelfHarmAdapter {
  if (config.SELF_HARM_VENDOR === 'none') return new DisabledSelfHarmAdapter();
  if (config.SELF_HARM_VENDOR === 'azure-content-safety') {
    if (!config.SELF_HARM_API_KEY || !config.SELF_HARM_API_BASE_URL) {
      throw new Error('SELF_HARM_VENDOR=azure-content-safety exige SELF_HARM_API_KEY e SELF_HARM_API_BASE_URL no .env.');
    }
    return new AzureContentSafetyAdapter(config.SELF_HARM_API_KEY, config.SELF_HARM_API_BASE_URL);
  }
  throw new Error(`SELF_HARM_VENDOR "${config.SELF_HARM_VENDOR}" ainda não tem adapter implementado.`);
}
