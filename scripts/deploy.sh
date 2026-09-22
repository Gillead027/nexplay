#!/usr/bin/env bash
# Publica o web + a API na VPS (a partir de uma máquina com Git Bash, ssh e scp).
#
#   scripts/deploy.sh <rótulo>        ex.: scripts/deploy.sh pre-typing-indicator
#
# O rótulo nomeia as imagens de volta ("nexplay-api-rollback:<rótulo>") para desfazer rápido. Antes de trocar qualquer
# coisa o script faz um backup completo (o mesmo do cron), guarda as imagens atuais, envia só o código (nunca secrets,
# .env, bancos ou node_modules), reconstrói web e api e confere que os dois ficaram saudáveis.
#
# Variáveis: VPS_HOST (padrão root@147.93.11.201), SSH_KEY (padrão ~/.ssh/gillecord_vultr), APP_DIR (padrão /opt/nexplay).
# O music-bot fica de fora de propósito (é isolado; ver README). A pasta infra/ também: na VPS ela tem as chaves de produção
# (livekit.local.yaml), que não podem ser trocadas pelas de desenvolvimento.
set -euo pipefail

LABEL="${1:-}"
[ -n "$LABEL" ] || { echo "Uso: scripts/deploy.sh <rótulo>"; exit 1; }
VPS_HOST="${VPS_HOST:-root@147.93.11.201}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/gillecord_vultr}"
APP_DIR="${APP_DIR:-/opt/nexplay}"
SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes "$VPS_HOST")

cd "$(dirname "${BASH_SOURCE[0]}")/.."
COMMIT="$(git rev-parse --short HEAD)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Aviso: há alterações não commitadas; o site publicado dirá que é o commit $COMMIT, mas o código enviado é o da pasta."
fi

# A versão publicada aparece em Configurações > Sobre e alimenta o aviso "nova versão disponível".
printf '{"commit":"%s","builtAt":"%s"}\n' "$COMMIT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > apps/web/build-info.json

TARBALL="$(mktemp -u "${TMPDIR:-/tmp}/nexplay-deploy-XXXXXX").tar.gz"
tar --exclude=node_modules --exclude=dist --exclude=data --exclude=secrets --exclude='*.db' --exclude='*.db-*' \
    --exclude=.env --exclude=.alerts --exclude=release --exclude=renderer-dist --exclude=.vite --exclude=coverage \
    --exclude='*.log' --exclude='*.tsbuildinfo' \
    -czf "$TARBALL" apps packages scripts package.json package-lock.json tsconfig.base.json README.md
if tar -tzf "$TARBALL" | grep -E '(^|/)(secrets/|\.env$|.*\.db$)' >/dev/null; then
  echo "ERRO: o pacote de deploy contém arquivo sensível; abortando."; rm -f "$TARBALL"; exit 1
fi

echo "==> Enviando $COMMIT ($(du -h "$TARBALL" | cut -f1))"
scp -i "$SSH_KEY" -o BatchMode=yes "$TARBALL" "$VPS_HOST:/tmp/nexplay-deploy.tar.gz"
rm -f "$TARBALL"

"${SSH[@]}" "APP_DIR='$APP_DIR' LABEL='$LABEL' bash -s" <<'REMOTE'
set -euo pipefail
cd "$APP_DIR"
echo "==> Backup antes de trocar"
if [ -x scripts/vps/backup.sh ]; then bash scripts/vps/backup.sh </dev/null; else echo "(backup.sh ainda não existe nesta VPS; pulando)"; fi
echo "==> Guardando as imagens atuais como '$LABEL'"
docker tag nexplay-api:latest "nexplay-api-rollback:$LABEL"
docker tag nexplay-web:latest "nexplay-web-rollback:$LABEL"
echo "==> Extraindo"
tar -xzf /tmp/nexplay-deploy.tar.gz -C "$APP_DIR"
rm -f /tmp/nexplay-deploy.tar.gz
sed -i 's/\r$//' scripts/vps/*.sh 2>/dev/null || true
chmod 755 scripts/vps/*.sh 2>/dev/null || true
echo "==> Construindo web e api"
docker compose build web api 2>&1 | tail -3
docker compose up -d --no-deps web api 2>&1 | tail -4
echo "==> Esperando ficarem saudáveis"
for i in $(seq 1 30); do
  api="$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q api)")"
  web="$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q web)")"
  [ "$api" = healthy ] && [ "$web" = healthy ] && break
  sleep 2
done
echo "api=$api web=$web"
[ "$api" = healthy ] && [ "$web" = healthy ] || { docker compose logs api --tail 30; exit 1; }
docker compose logs api --since 1m 2>&1 | tail -5
REMOTE

DOMAIN="$("${SSH[@]}" "grep -E '^APP_DOMAIN=' $APP_DIR/.env | cut -d= -f2- | tr -d '\r\"'")"
printf '==> Site: '; curl -s -o /dev/null -w '%{http_code}\n' "https://$DOMAIN/"
printf '==> API:  '; curl -s -o /dev/null -w '%{http_code}\n' "https://$DOMAIN/api/health"
echo "Pronto: $COMMIT no ar. Para desfazer: docker tag nexplay-api-rollback:$LABEL nexplay-api:latest (e o mesmo para web) e docker compose up -d --no-deps web api."
