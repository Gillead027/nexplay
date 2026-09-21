// Gera src/licenses.json: os pacotes de terceiros que entram no app web (dependências de produção
// de @nexplay/web e de @nexplay/shared, com tudo que elas puxam), com versão e licença.
// Roda à mão quando as dependências mudam: npm run licenses -w @nexplay/web
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const packages = lock.packages;

// Resolve como o Node: procura em <pacote>/node_modules, depois sobe até a raiz.
function resolve(from, name) {
  let base = from;
  for (;;) {
    const candidate = base ? `${base}/node_modules/${name}` : `node_modules/${name}`;
    if (packages[candidate]) return candidate;
    if (!base) return null;
    const cut = base.lastIndexOf('/node_modules/');
    base = cut >= 0 ? base.slice(0, cut) : base.startsWith('node_modules/') ? '' : '';
  }
}

const seen = new Set();
const queue = ['apps/web', 'packages/shared'];
while (queue.length) {
  const path = queue.pop();
  if (seen.has(path)) continue;
  seen.add(path);
  const entry = packages[path];
  const deps = { ...entry.dependencies, ...entry.optionalDependencies };
  for (const name of Object.keys(deps)) {
    const target = resolve(path, name);
    if (target && !seen.has(target)) queue.push(target);
  }
}

function readPackageJson(path) {
  const file = join(root, path, 'package.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

// Os pacotes escrevem o repositório de jeitos diferentes (git@, github:, "dono/repo"...).
function normalizeUrl(raw, license) {
  let url = String(raw ?? '').trim().replace(/^git\+/, '').replace(/\.git$/, '');
  if (url.startsWith('git@github.com:')) url = url.replace('git@github.com:', 'https://github.com/');
  else if (url.startsWith('github:')) url = url.replace('github:', 'https://github.com/');
  else if (url.startsWith('git://')) url = url.replace('git://', 'https://');
  else if (/^[\w.-]+\/[\w.-]+$/.test(url)) url = `https://github.com/${url}`;
  if (!url) url = /SEE LICENSE IN (https?:\/\/\S+)/.exec(license)?.[1] ?? '';
  return url;
}

const result = [];
for (const path of seen) {
  if (!path.startsWith('node_modules/')) continue; // os próprios workspaces
  const entry = packages[path];
  if (entry.link) continue; // link para um workspace nosso
  const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
  if (name.startsWith('@nexplay/')) continue;
  const manifest = readPackageJson(path);
  const license = entry.license ?? manifest.license ?? (Array.isArray(manifest.licenses) ? manifest.licenses.map((item) => item.type).join(' OR ') : 'não informada');
  const repository = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url ?? manifest.homepage ?? '';
  result.push({
    name,
    version: entry.version,
    license: typeof license === 'string' ? license : JSON.stringify(license),
    url: normalizeUrl(repository, String(license)),
  });
}
// Arquivos de terceiros que vão em public/ (não são pacotes que o Vite empacota, então a busca acima não os vê).
const inter = packages['node_modules/@fontsource-variable/inter'];
if (inter) result.push({ name: 'Inter (fonte, @fontsource-variable/inter)', version: inter.version, license: inter.license ?? 'OFL-1.1', url: 'https://rsms.me/inter/' });
result.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

const output = join(root, 'apps', 'web', 'src', 'licenses.json');
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
const counts = {};
for (const item of result) counts[item.license] = (counts[item.license] ?? 0) + 1;
console.log(`${result.length} pacotes gravados em apps/web/src/licenses.json`);
console.log(JSON.stringify(counts));
