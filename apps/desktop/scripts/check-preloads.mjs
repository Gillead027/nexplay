// Os preloads rodam com sandbox:true: lá dentro require() só aceita 'electron' (e alguns módulos do Node).
// Qualquer outro require faz o preload quebrar inteiro ao carregar, e o site fica sem a ponte com o app
// (foi o bug do 0.2.19/0.2.20: sem botões de minimizar/maximizar/fechar). Roda depois do build.
import { readFileSync } from 'node:fs';

const allowed = new Set(['electron', 'events', 'timers', 'url']);
let failed = false;
for (const file of ['dist/preload.js', 'dist/picker-preload.js']) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const requires = [...source.matchAll(/require\(["']([^"']+)["']\)/g)].map((match) => match[1]);
  const bad = requires.filter((name) => !allowed.has(name));
  if (bad.length > 0) {
    failed = true;
    console.error(`${file}: require não permitido no sandbox: ${[...new Set(bad)].join(', ')}`);
  }
}
if (failed) process.exit(1);
console.log('preloads ok: só require("electron")');
