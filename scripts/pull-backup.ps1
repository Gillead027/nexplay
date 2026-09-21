# Copia os backups da VPS para este computador (uma cópia FORA da VPS: se a máquina se perder, os dados não se perdem).
#
#   powershell -ExecutionPolicy Bypass -File scripts\pull-backup.ps1
#
# Traz os arquivos que ainda não estão aqui e apaga os locais além dos últimos $Keep. Para rodar todo dia (o PC precisa
# estar ligado), registre uma tarefa agendada uma única vez:
#   schtasks /Create /TN "NexPlay backup" /SC DAILY /ST 12:00 /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\nexplay\scripts\pull-backup.ps1"
param(
  [string]$VpsHost = 'root@147.93.11.201',
  [string]$KeyPath = "$env:USERPROFILE\.ssh\gillecord_vultr",
  [string]$Destination = "$env:USERPROFILE\NexPlay-backups",
  [int]$Keep = 10
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Destination | Out-Null

$remote = & ssh -i $KeyPath -o BatchMode=yes $VpsHost 'ls -1 /opt/nexplay/backups/daily/nexplay-*.tar.zst 2>/dev/null | tail -n 3'
if (-not $remote) { throw 'Nenhum backup encontrado na VPS.' }

foreach ($path in $remote) {
  $name = Split-Path $path -Leaf
  $target = Join-Path $Destination $name
  if (Test-Path $target) { continue }
  Write-Host "Baixando $name"
  & scp -i $KeyPath -o BatchMode=yes "${VpsHost}:$path" "$target.part"
  if ($LASTEXITCODE -ne 0) { Remove-Item "$target.part" -ErrorAction SilentlyContinue; throw "Falha ao baixar $name" }
  Move-Item "$target.part" $target
}

Get-ChildItem $Destination -Filter 'nexplay-*.tar.zst' | Sort-Object Name -Descending | Select-Object -Skip $Keep | Remove-Item -Force
$count = (Get-ChildItem $Destination -Filter 'nexplay-*.tar.zst').Count
Write-Host "Pronto: $count backup(s) em $Destination"
