#!/usr/bin/env bash
# Backup diário do NexPlay (roda na VPS, pelo cron instalado por install.sh).
#
# Guarda, num único arquivo .tar.zst por dia: uma cópia CONSISTENTE do banco SQLite (VACUUM INTO, com o app no ar),
# os anexos (MinIO) e a configuração (.env, infra, secrets), que é o que falta para reerguer tudo numa máquina nova.
# Mantém os últimos KEEP_DAYS dias e um por semana (WEEKLY_KEEP semanas). Se algo falhar, sai com erro (o cron registra
# no log e o healthcheck.sh avisa quando o último backup bom fica velho demais).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/nexplay}"
BACKUP_ROOT="${BACKUP_ROOT:-$APP_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
WEEKLY_KEEP="${WEEKLY_KEEP:-8}"
MIN_FREE_MB="${MIN_FREE_MB:-2048}"

cd "$APP_DIR"
mkdir -p "$BACKUP_ROOT/daily" "$BACKUP_ROOT/weekly"
chmod 700 "$BACKUP_ROOT" "$BACKUP_ROOT/daily" "$BACKUP_ROOT/weekly"
umask 077

stamp="$(date +%Y%m%d-%H%M%S)"
log() { echo "[$(date -Iseconds)] $*"; }

free_mb="$(df -Pm "$BACKUP_ROOT" | awk 'NR==2 {print $4}')"
if [ "$free_mb" -lt "$MIN_FREE_MB" ]; then
  log "ERRO: só ${free_mb} MB livres em $BACKUP_ROOT (mínimo ${MIN_FREE_MB} MB); backup cancelado."
  exit 1
fi

api_container="$(docker compose ps -q api)"
[ -n "$api_container" ] || { log "ERRO: o container da API não está rodando."; exit 1; }
data_dir="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Source}}{{end}}{{end}}' "$api_container")"
minio_container="$(docker compose ps -q minio || true)"
minio_dir=""
if [ -n "$minio_container" ]; then
  minio_dir="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' "$minio_container")"
fi
[ -d "$data_dir" ] || { log "ERRO: pasta de dados da API não encontrada."; exit 1; }

work="$(mktemp -d "$BACKUP_ROOT/.work-XXXXXX")"
trap 'rm -rf "$work"' EXIT
snapshot=".backup-$stamp.db"

# Cópia consistente do banco feita pelo próprio SQLite (o app continua atendendo enquanto isso), conferida em seguida.
docker compose exec -T -e SNAPSHOT="/app/data/$snapshot" api node -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.env.DB_PATH || "/app/data/nexplay.db");
db.exec(`VACUUM INTO \x27${process.env.SNAPSHOT.replace(/\x27/g, "")}\x27`);
db.close();
const copy = new DatabaseSync(process.env.SNAPSHOT, { readOnly: true });
const result = copy.prepare("PRAGMA integrity_check").get();
const value = Object.values(result)[0];
if (value !== "ok") { console.error("integrity_check:", value); process.exit(2); }
console.log("banco copiado e íntegro (" + copy.prepare("SELECT COUNT(*) AS n FROM users").get().n + " contas)");
' </dev/null
mv "$data_dir/$snapshot" "$work/nexplay.db"

mkdir -p "$work/minio" "$work/config"
[ -n "$minio_dir" ] && [ -d "$minio_dir" ] && cp -a "$minio_dir/." "$work/minio/"
cp -a .env "$work/config/.env" 2>/dev/null || true
for item in infra secrets docker-compose.yml; do
  [ -e "$item" ] && cp -a "$item" "$work/config/"
done
# Sprites de Pokémon são baixados de novo da PokeAPI quando faltam, então ficam de fora.

out="$BACKUP_ROOT/daily/nexplay-$stamp.tar.zst"
tar -C "$work" -cf - . | zstd -q -T0 -10 -o "$out"
zstd -q -t "$out"
size="$(du -h "$out" | cut -f1)"
log "OK: $out ($size)"

# Uma cópia por semana (domingo), guardada por mais tempo.
if [ "$(date +%u)" = "7" ]; then
  cp "$out" "$BACKUP_ROOT/weekly/"
  ls -1t "$BACKUP_ROOT"/weekly/nexplay-*.tar.zst 2>/dev/null | tail -n +"$((WEEKLY_KEEP + 1))" | xargs -r rm -f
fi
find "$BACKUP_ROOT/daily" -name 'nexplay-*.tar.zst' -mtime +"$KEEP_DAYS" -delete
date +%s > "$BACKUP_ROOT/LAST_OK"
log "Backups guardados: $(ls -1 "$BACKUP_ROOT/daily" | wc -l) diários, $(ls -1 "$BACKUP_ROOT/weekly" | wc -l) semanais."
