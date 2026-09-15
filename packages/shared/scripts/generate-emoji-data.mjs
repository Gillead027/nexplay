// Gera packages/shared/src/emoji-data.ts a partir do pacote npm
// unicode-emoji-json (instalado só temporariamente pra rodar este script —
// não é dependência de build). Pra re-gerar no futuro (ex. nova versão do
// unicode com mais emojis):
//   npm install unicode-emoji-json --no-save -w @sausixudos/shared
//   node packages/shared/scripts/generate-emoji-data.mjs
//   npm install   (na raiz, sem args, pra restaurar o lockfile)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dataByGroup from 'unicode-emoji-json/data-by-group.json' with { type: 'json' };

const groups = Object.values(dataByGroup);

const entries = [];
for (const group of groups) {
  for (const item of group.emojis) {
    entries.push({ emoji: item.emoji, name: item.name, slug: item.slug, group: group.name });
  }
}

const groupNames = groups.map((group) => group.name);

const outPath = fileURLToPath(new URL('../src/emoji-data.ts', import.meta.url));
const header = `// GERADO por packages/shared/scripts/generate-emoji-data.mjs — não editar à mão.
// Fonte: pacote npm unicode-emoji-json (dados do unicode.org). Ver o script
// gerador pra instruções de como re-gerar este arquivo.

export interface EmojiDatasetEntry {
  emoji: string;
  name: string;
  slug: string;
  group: string;
}

export const EMOJI_GROUPS: string[] = ${JSON.stringify(groupNames)};

export const EMOJI_DATA: EmojiDatasetEntry[] = ${JSON.stringify(entries, null, 2)};
`;

writeFileSync(outPath, header, 'utf8');
console.log(`Gerado ${outPath} com ${entries.length} emojis em ${groupNames.length} categorias.`);
