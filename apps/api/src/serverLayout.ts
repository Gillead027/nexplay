import { z } from 'zod';
import { SERVER_FOLDER_NAME_MAX_LENGTH, type ServerLayout } from '@nexplay/shared';

// A organização da lista de servidores de cada pessoa (servidores soltos e pastas). É só uma preferência de exibição:
// guarda ids de servidores e nada mais, e na hora de ler/gravar é sempre conferida contra os servidores em que a pessoa
// realmente está, então um id velho ou inventado nunca vaza nem aparece.

const idSchema = z.string().min(1).max(64);

const itemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('server'), serverId: idSchema }),
  z.object({
    type: z.literal('folder'),
    id: idSchema,
    name: z.string().trim().max(SERVER_FOLDER_NAME_MAX_LENGTH),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    serverIds: z.array(idSchema).max(200),
  }),
]);

export const serverLayoutSchema = z.object({ items: z.array(itemSchema).max(400) });

// A regra que deixa o layout coerente com os servidores da pessoa é a mesma do cliente: vive em @nexplay/shared.
export { normalizeServerLayout } from '@nexplay/shared';

export function parseStoredServerLayout(json: string): ServerLayout {
  if (!json) return { items: [] };
  try {
    const parsed = serverLayoutSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : { items: [] };
  } catch {
    return { items: [] };
  }
}
