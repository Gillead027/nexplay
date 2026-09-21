#!/usr/bin/env bash
# Vigia do NexPlay (roda na VPS a cada minuto, pelo cron instalado por install.sh).
#
# - Pede /api/health pelo endereço público (testa Caddy, certificado e API de uma vez). Depois de FAIL_LIMIT falhas seguidas
#   reinicia a API e o site e registra o que fez.
# - Avisa se o disco passar de DISK_ALERT_PERCENT% ou se o último backup bom tiver mais de BACKUP_MAX_AGE_H horas.
# - Se existir /opt/nexplay/.alerts com ALERT_WEBHOOK_URL=..., manda o aviso para lá (webhook do Discord, ou um tópico
#   do ntfy.sh: qualquer outra URL recebe o texto por POST). Um aviso por mudança de estado, sem repetir a cada minuto.
#
# Este vigia mora na mesma máquina que vigia: se a VPS inteira cair, só um monitor externo (UptimeRobot, etc.) avisa.
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/nexplay}"
STATE_DIR="${STATE_DIR:-/var/lib/nexplay-health}"
FAIL_LIMIT="${FAIL_LIMIT:-3}"
DISK_ALERT_PERCENT="${DISK_ALERT_PERCENT:-90}"
BACKUP_MAX_AGE_H="${BACKUP_MAX_AGE_H:-36}"

mkdir -p "$STATE_DIR"
cd "$APP_DIR" || exit 1
ALERT_WEBHOOK_URL=""
# shellcheck disable=SC1091
[ -f "$APP_DIR/.alerts" ] && . "$APP_DIR/.alerts"
DOMAIN="$(grep -E '^APP_DOMAIN=' "$APP_DIR/.env" | head -1 | cut -d= -f2- | tr -d '\r"')"
[ -n "$DOMAIN" ] || exit 1

log() { echo "[$(date -Iseconds)] $*"; }

notify() {
  local text="NexPlay ($DOMAIN): $1"
  log "AVISO: $1"
  [ -n "$ALERT_WEBHOOK_URL" ] || return 0
  case "$ALERT_WEBHOOK_URL" in
    *discord.com/api/webhooks/*|*discordapp.com/api/webhooks/*)
      curl -fsS --max-time 10 -H 'Content-Type: application/json' -d "{\"content\": \"${text//\"/\\\"}\"}" "$ALERT_WEBHOOK_URL" >/dev/null || true ;;
    *) curl -fsS --max-time 10 -d "$text" "$ALERT_WEBHOOK_URL" >/dev/null || true ;;
  esac
}

# Um aviso só quando o estado de uma verificação muda (ok -> problema e problema -> ok).
flag() {
  local name="$1" bad="$2" message="$3" recovered="$4" file="$STATE_DIR/flag-$1"
  if [ "$bad" = "1" ]; then
    [ -f "$file" ] || { touch "$file"; notify "$message"; }
  elif [ -f "$file" ]; then
    rm -f "$file"; notify "$recovered"
  fi
}

# ---- site e API
fails_file="$STATE_DIR/fails"
fails="$(cat "$fails_file" 2>/dev/null || echo 0)"
if curl -fsS --max-time 10 -o /dev/null "https://$DOMAIN/api/health"; then
  [ "$fails" -ge "$FAIL_LIMIT" ] && log "Voltou ao normal depois de $fails falhas."
  echo 0 > "$fails_file"
  flag site 0 "" "o site voltou ao ar."
else
  fails=$((fails + 1))
  echo "$fails" > "$fails_file"
  log "Falha $fails no /api/health."
  if [ "$fails" -eq "$FAIL_LIMIT" ]; then
    flag site 1 "o site não responde há $FAIL_LIMIT minutos; reiniciando a API e o site." ""
    docker compose restart api web >/dev/null 2>&1 && log "API e site reiniciados." || log "ERRO ao reiniciar a API e o site."
  fi
fi

# ---- containers marcados como doentes (fora a API/site, que o teste acima já trata)
for service in livekit caddy music-bot; do
  container="$(docker compose ps -q "$service" 2>/dev/null)"
  [ -n "$container" ] || continue
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null)"
  count_file="$STATE_DIR/unhealthy-$service"
  if [ "$status" = "unhealthy" ] || [ "$status" = "exited" ]; then
    count=$(( $(cat "$count_file" 2>/dev/null || echo 0) + 1 ))
    echo "$count" > "$count_file"
    if [ "$count" -eq "$FAIL_LIMIT" ]; then
      flag "svc-$service" 1 "o serviço $service está $status; reiniciando." ""
      docker compose restart "$service" >/dev/null 2>&1 || true
    fi
  else
    echo 0 > "$count_file"
    flag "svc-$service" 0 "" "o serviço $service voltou ao normal."
  fi
done

# ---- disco
used="$(df -P / | awk 'NR==2 {gsub("%", "", $5); print $5}')"
if [ "$used" -ge "$DISK_ALERT_PERCENT" ]; then flag disk 1 "o disco está com ${used}% de uso." ""; else flag disk 0 "" "o disco voltou para ${used}% de uso."; fi

# ---- backup velho
last="$(cat "$APP_DIR/backups/LAST_OK" 2>/dev/null || echo 0)"
age_h=$(( ($(date +%s) - last) / 3600 ))
if [ "$age_h" -ge "$BACKUP_MAX_AGE_H" ]; then flag backup 1 "o último backup bom tem mais de ${age_h}h (o backup diário falhou?)." ""; else flag backup 0 "" "o backup diário voltou a funcionar."; fi
