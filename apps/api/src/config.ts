import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import { parseVoiceChannels } from '@nexplay/shared';

loadEnv({ path: new URL('../../../.env', import.meta.url), quiet: true });

// docker-compose.yml passa variável opcional não definida como string vazia
// ("${VAR:-}"), nunca omite a chave — sem isso, .optional() sozinho rejeitava
// "" contra um .min(1)/.url() em vez de tratar como "não configurado".
const optionalString = (schema: z.ZodString) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  INVITE_TOKEN: z.string().min(8, 'INVITE_TOKEN deve ter pelo menos 8 caracteres'),
  // Cadastro aberto: qualquer pessoa cria conta sem o código de cadastro (INVITE_TOKEN). A conta
  // nova não entra em servidor nenhum sozinha; só vê o que criar ou aquilo em que entrar por convite.
  OPEN_REGISTRATION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Nomes de usuário (separados por vírgula) que veem o painel de administração da instância.
  ADMIN_USERNAMES: z.string().default(''),
  // Quantos servidores uma conta pode ter (como dona) ao mesmo tempo; 0 = sem limite. Quem está em ADMIN_USERNAMES não tem
  // limite. Com o cadastro aberto isso impede uma conta de encher o banco de servidores (cada um pode ter ícone e painel).
  MAX_SERVERS_PER_USER: z.coerce.number().int().min(0).default(5),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET deve ter pelo menos 32 caracteres'),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(32, 'LIVEKIT_API_SECRET deve ter pelo menos 32 caracteres'),
  LIVEKIT_PUBLIC_URL: z.string().url(),
  LIVEKIT_INTERNAL_URL: z.string().url().default('http://localhost:7880'),
  MUSIC_BOT_INTERNAL_URL: z.string().url().default('http://music-bot:4100'),
  DB_PATH: z.string().default('./data/nexplay.db'),
  VOICE_CHANNELS: z.string().default(
    'geral:Geral:Conversa livre,jogos:Jogos:Partidas e squads,afk:AFK:Pausa rápida',
  ),
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().min(1).max(65535).default(9000),
  MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  MINIO_ACCESS_KEY: z.string().min(1).default('nexplay'),
  MINIO_SECRET_KEY: z.string().min(8).default('nexplay-dev-secret'),
  // Nome mantido de propósito (rebrand Sausixudos → NexPlay): é o bucket já
  // existente em produção com anexos reais. Migrar o conteúdo pra um bucket
  // novo não traz ganho visível (nunca aparece pro usuário) e só adiciona
  // risco de anexo quebrado no meio da cópia.
  MINIO_BUCKET: z.string().default('sausixudos-attachments'),
  // Verificação de idade/identidade (KYC): 'none' desativa o recurso inteiro — nenhuma
  // verificação é exigida e a tela de verificação nem aparece pro usuário. 'manual' é revisão
  // humana (documento + selfie, sem custo, sem vendor — ver identityVerification.ts); os
  // outros exigem um vendor pago real configurado via as credenciais abaixo (kycAdapter.ts).
  KYC_VENDOR: z.enum(['none', 'manual', 'unico', 'caf', 'veriff', 'persona']).default('none'),
  KYC_API_KEY: optionalString(z.string().min(1)),
  KYC_API_BASE_URL: optionalString(z.string().url()),
  KYC_WEBHOOK_SECRET: optionalString(z.string().min(16)),
  // Com o vendor configurado mas isto em false, a verificação fica disponível mas opcional
  // (só o selo/gate de UI); em true, o webhook do LiveKit muta câmera/tela de quem não
  // verificou. Falso por padrão — só passa a valer depois de um admin ligar de propósito.
  IDENTITY_VERIFICATION_REQUIRED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Classificador de autolesão/risco de suicídio em mensagens de texto. 'none' desativa (nada
  // é chamado). Azure Content Safety tem nível grátis (F0, 5000 textos/mês) — ver selfHarmAdapter.ts.
  SELF_HARM_VENDOR: z.enum(['none', 'azure-content-safety']).default('none'),
  SELF_HARM_API_KEY: optionalString(z.string().min(1)),
  SELF_HARM_API_BASE_URL: optionalString(z.string().url()),
  // Mostrado em privado pra quem for identificado por uma mensagem preocupante — configurável
  // porque uma instância fora do Brasil vai querer outro recurso de apoio que não o CVV.
  SUPPORT_RESOURCE_TEXT: z.string().default('CVV: 188 (ligação gratuita, 24h) — https://www.cvv.org.br'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Configuração inválida:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = {
  ...parsed.data,
  channels: parseVoiceChannels(parsed.data.VOICE_CHANNELS),
  isProduction: parsed.data.NODE_ENV === 'production',
};
