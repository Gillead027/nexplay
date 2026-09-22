// Menção: "@Nome" no texto da mensagem chama a pessoa (o nome pode ter espaços, então a busca é pelo nome inteiro). Vale
// quando o "@" começa uma palavra e o nome termina antes de uma letra ou número, para "@Ana" não pegar "@Ananda".

const NAME_CHARACTER = /[\p{L}\p{N}_]/u;

export function mentionsUser(text: string, name: string): boolean {
  const needle = `@${name.trim().toLowerCase()}`;
  if (needle.length <= 1) return false;
  const haystack = text.toLowerCase();
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) return false;
    const before = index === 0 ? '' : haystack[index - 1]!;
    const after = haystack[index + needle.length] ?? '';
    if (!NAME_CHARACTER.test(before) && !NAME_CHARACTER.test(after)) return true;
    from = index + 1;
  }
}
