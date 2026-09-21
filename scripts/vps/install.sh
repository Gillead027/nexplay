#!/usr/bin/env bash
# Instala (ou atualiza) na VPS o backup diário, o vigia e a rotação dos logs. Pode rodar de novo quando quiser.
#   ssh root@VPS 'bash /opt/nexplay/scripts/vps/install.sh'
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/nexplay}"
cd "$APP_DIR"

# Arquivos enviados de uma máquina Windows podem ter fim de linha CRLF, que o bash não aceita.
sed -i 's/\r$//' scripts/vps/*.sh
chmod 755 scripts/vps/*.sh

if ! command -v zstd >/dev/null; then apt-get install -y zstd >/dev/null; fi

cat > /etc/cron.d/nexplay <<EOF
# NexPlay: backup diário às 04:17 e vigia a cada minuto (instalado por scripts/vps/install.sh)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 4 * * * root $APP_DIR/scripts/vps/backup.sh >> /var/log/nexplay-backup.log 2>&1
* * * * * root $APP_DIR/scripts/vps/healthcheck.sh >> /var/log/nexplay-health.log 2>&1
EOF
chmod 644 /etc/cron.d/nexplay

cat > /etc/logrotate.d/nexplay <<'EOF'
/var/log/nexplay-backup.log /var/log/nexplay-health.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
}
EOF

echo "Instalado: backup diário 04:17, vigia a cada minuto."
echo "Para receber avisos, crie $APP_DIR/.alerts com a linha: ALERT_WEBHOOK_URL=https://..."
