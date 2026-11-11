#Requires -Version 5.1
<#
  LEVÍTICO STREETWEAR — publicar.ps1
  ---------------------------------------------------------------------------
  Publica el sitio en Vercel automáticamente cada vez que guardas un cambio.

  Uso:
    .\publicar.ps1              Vigila la carpeta y publica al detectar cambios.
    .\publicar.ps1 -Ahora       Publica una sola vez y sale.
    .\publicar.ps1 -Git         Hace commit y push a GitHub antes de publicar.
    .\publicar.ps1 -Espera 10   Espera 10 s de silencio antes de publicar.

  También puedes hacer doble clic en publicar.bat (abre el vigilante).
#>
param(
  [switch]$Ahora,
  [switch]$Git,
  [int]$Espera = 6,
  [int]$Intervalo = 2,
  [string]$Mensaje = ""
)

$ErrorActionPreference = 'Stop'

$raiz = $PSScriptRoot
if (-not $raiz) { $raiz = Split-Path -Parent $MyInvocation.MyCommand.Path }
Set-Location -LiteralPath $raiz

$log = Join-Path $raiz 'publicar.log'

$extensiones = @(
  '.html', '.css', '.js', '.json', '.webmanifest', '.svg',
  '.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif',
  '.woff2', '.woff', '.ico', '.txt'
)
$ignorarCarpetas = @('.git', '.vercel', 'node_modules', 'supabase', '.vscode', '.idea')
$ignorarArchivos = @('publicar.log', '.env', '.env.local')

function Escribir-Log {
  param([string]$Texto, [string]$Color = 'Gray')
  $hora = (Get-Date).ToString('HH:mm:ss')
  Write-Host ("[{0}] {1}" -f $hora, $Texto) -ForegroundColor $Color
  try {
    Add-Content -LiteralPath $log -Value ("[{0}] {1}" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $Texto) -Encoding UTF8
  } catch { }
}

function Obtener-Vercel {
  $cmd = Get-Command 'vercel' -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $ruta = Join-Path $env:APPDATA 'npm\vercel.cmd'
  if (Test-Path -LiteralPath $ruta) { return $ruta }
  return $null
}

function Tomar-Foto {
  # Devuelve una tabla ruta-relativa -> fecha de modificación (ticks).
  $mapa = @{}
  $cola = New-Object System.Collections.Queue
  $cola.Enqueue((Get-Item -LiteralPath $raiz))
  while ($cola.Count -gt 0) {
    $dir = $cola.Dequeue()
    foreach ($item in (Get-ChildItem -LiteralPath $dir.FullName -ErrorAction SilentlyContinue)) {
      if ($item.PSIsContainer) {
        if ($ignorarCarpetas -contains $item.Name) { continue }
        $cola.Enqueue($item)
        continue
      }
      if ($ignorarArchivos -contains $item.Name) { continue }
      if ($extensiones -notcontains $item.Extension.ToLower()) { continue }
      $rel = $item.FullName.Substring($raiz.Length).TrimStart('\')
      $mapa[$rel] = $item.LastWriteTimeUtc.Ticks
    }
  }
  return $mapa
}

function Comparar-Fotos {
  param($Antes, $Despues)
  $cambios = New-Object System.Collections.Generic.List[string]
  foreach ($k in $Despues.Keys) {
    if (-not $Antes.ContainsKey($k)) { $cambios.Add("nuevo: $k") }
    elseif ($Antes[$k] -ne $Despues[$k]) { $cambios.Add("editado: $k") }
  }
  foreach ($k in $Antes.Keys) {
    if (-not $Despues.ContainsKey($k)) { $cambios.Add("borrado: $k") }
  }
  return $cambios
}

function Sincronizar-Git {
  param([string]$Texto)
  $msg = $Mensaje
  if (-not $msg) {
    if ($Texto) { $msg = $Texto } else { $msg = 'Actualización ' + (Get-Date).ToString('yyyy-MM-dd HH:mm') }
  }
  try {
    & git add -A 2>&1 | Out-Null
    & git commit -m $msg 2>&1 | Out-Null
    $push = & git push 2>&1
    if ($LASTEXITCODE -eq 0) {
      Escribir-Log "GitHub al día: $msg" 'DarkCyan'
    } else {
      Escribir-Log ("GitHub sin cambios o push fallido: " + ($push -join ' ')) 'DarkYellow'
    }
  } catch {
    Escribir-Log "No se pudo sincronizar con GitHub: $($_.Exception.Message)" 'DarkYellow'
  }
}

function Publicar {
  param([string[]]$Cambios)

  $vercel = Obtener-Vercel
  if (-not $vercel) {
    Escribir-Log 'No encuentro Vercel CLI. Instálalo con: npm i -g vercel' 'Red'
    return $false
  }

  if ($Cambios -and $Cambios.Count -gt 0) {
    $lista = ($Cambios | Select-Object -Unique) -join ', '
    Escribir-Log "Cambios detectados: $lista" 'DarkYellow'
  }

  if ($Git) { Sincronizar-Git -Texto ($(if ($Cambios) { $Cambios[0] } else { '' })) }

  Escribir-Log 'Publicando en Vercel…' 'Cyan'
  $inicio = Get-Date
  $salida = & $vercel --prod --yes 2>&1
  $codigo = $LASTEXITCODE
  $segundos = [math]::Round(((Get-Date) - $inicio).TotalSeconds)

  foreach ($linea in $salida) {
    try { Add-Content -LiteralPath $log -Value ([string]$linea) -Encoding UTF8 } catch { }
  }

  if ($codigo -eq 0) {
    $url = ''
    foreach ($linea in $salida) {
      $texto = [string]$linea
      if ($texto -match 'https://[^\s]+\.vercel\.app') {
        $url = $matches[0]
      }
    }
    if ($url) {
      Escribir-Log "Listo en $segundos s → $url" 'Green'
    } else {
      Escribir-Log "Listo en $segundos s." 'Green'
    }
    return $true
  }

  Escribir-Log "Vercel falló (código $codigo). Revisa publicar.log." 'Red'
  return $false
}

# ---------------------------------------------------------------------------

Write-Host ''
Write-Host '  LEVÍTICO STREETWEAR · publicador' -ForegroundColor Yellow
Write-Host "  Carpeta: $raiz" -ForegroundColor DarkGray
Write-Host ''

if (-not (Test-Path -LiteralPath (Join-Path $raiz 'index.html'))) {
  Escribir-Log 'Esta carpeta no parece el proyecto (falta index.html).' 'Red'
  exit 1
}

if ($Ahora) {
  $ok = Publicar
  if ($ok) { exit 0 } else { exit 1 }
}

Escribir-Log "Vigilando cambios. Espera $Espera s de silencio antes de publicar. Ctrl+C para salir." 'Cyan'

$foto = Tomar-Foto
$pendientes = New-Object System.Collections.Generic.List[string]
$ultimoCambio = $null

while ($true) {
  Start-Sleep -Seconds $Intervalo

  $nueva = Tomar-Foto
  $diferencia = Comparar-Fotos -Antes $foto -Despues $nueva

  if ($diferencia.Count -gt 0) {
    foreach ($cambio in $diferencia) { $pendientes.Add($cambio) }
    $foto = $nueva
    $ultimoCambio = Get-Date
    Escribir-Log ("Detectado → " + ($diferencia -join ', ')) 'DarkYellow'
  }

  if ($ultimoCambio -ne $null -and ((Get-Date) - $ultimoCambio).TotalSeconds -ge $Espera) {
    $lista = @($pendientes | Select-Object -Unique)
    $null = Publicar -Cambios $lista
    $pendientes.Clear()
    $ultimoCambio = $null
    # Rehacer la foto: Vercel no toca la carpeta, pero por si acaso.
    $foto = Tomar-Foto
    Escribir-Log 'Seguimos vigilando. Ctrl+C para salir.' 'DarkGray'
  }
}
