# Vigia independente do NexPlay: roda NESTE PC, fora da VPS — por isso continua
# funcionando e avisando mesmo se a VPS inteira cair. O vigia que já roda na
# própria VPS (scripts/vps/healthcheck.sh) reinicia serviços sozinho, mas não
# tem como avisar ninguém se a máquina inteira travar; este script existe
# justamente para cobrir esse buraco, sem depender de nenhum serviço terceiro
# (Discord, ntfy.sh, etc.) — só o Windows do próprio computador.
#
#   powershell -ExecutionPolicy Bypass -File scripts\watch-site.ps1
#
# Só mostra notificação quando o estado MUDA (site caiu / site voltou), nunca a
# cada checagem — o último estado fica em $StateFile. Para rodar sozinho de
# tempos em tempos (o PC precisa estar ligado), registre uma tarefa agendada
# uma única vez:
#   schtasks /Create /TN "NexPlay watch" /SC MINUTE /MO 5 /TR "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\nexplay\scripts\watch-site.ps1"
param(
  [string]$Domain = '147-93-11-201.sslip.io',
  [string]$StateFile = "$env:USERPROFILE\.nexplay-watch-state",
  [int]$TimeoutSeconds = 10
)
$ErrorActionPreference = 'Stop'

function Show-Toast {
  param([string]$Title, [string]$Text, [string]$IconKind = 'Warning')
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $icon = New-Object System.Windows.Forms.NotifyIcon
  try {
    $icon.Icon = [System.Drawing.SystemIcons]::$IconKind
    $icon.Visible = $true
    $icon.BalloonTipTitle = $Title
    $icon.BalloonTipText = $Text
    $icon.ShowBalloonTip(15000)
    Start-Sleep -Seconds 8
  } finally {
    $icon.Dispose()
  }
}

$lastState = if (Test-Path $StateFile) { (Get-Content $StateFile -Raw).Trim() } else { 'up' }

$currentState = 'up'
try {
  $response = Invoke-WebRequest -Uri "https://$Domain/api/health" -TimeoutSec $TimeoutSeconds -UseBasicParsing
  if ($response.StatusCode -ne 200) { $currentState = 'down' }
} catch {
  $currentState = 'down'
}

if ($currentState -ne $lastState) {
  if ($currentState -eq 'down') {
    Show-Toast -Title 'NexPlay fora do ar' -Text "$Domain não respondeu. Verifique a VPS." -IconKind 'Error'
  } else {
    Show-Toast -Title 'NexPlay voltou ao normal' -Text "$Domain está respondendo de novo." -IconKind 'Information'
  }
  Set-Content -Path $StateFile -Value $currentState -NoNewline
}
