# Compila el firmware de la ESP32-CAMERA y publica la imagen de primera instalación, igual
# que la del sensor: first-flash.bin (imagen combinada para 0x0) + componentes + manifest.json.
# El dashboard la ofrece en "Dispositivo nuevo" → "ESP32-CAMERA".
#
# Uso (desde firmware/esp32-camara, en PowerShell):
#   powershell -ExecutionPolicy Bypass -File publicar-imagen.ps1
#   powershell -ExecutionPolicy Bypass -File publicar-imagen.ps1 -PermitirLocal   # imagen para el servidor local
#
# La imagen queda en src/backend/esp32-firmware/camara/first-install/. En Plesk esa carpeta
# se sube a mano (esp32-firmware no va en el zip de despliegue).
param(
	[switch]$PermitirLocal,
	[string]$Destino = (Join-Path $PSScriptRoot '..\..\src\backend\esp32-firmware\camara\first-install')
)

$ErrorActionPreference = 'Stop'
$proyecto = $PSScriptRoot
$configPath = Join-Path $proyecto 'include\config.h'
if (-not (Test-Path $configPath)) { throw 'Falta include/config.h. Copia include/config.example.h como config.h y complétalo.' }

# --- Revisar la configuración que va dentro de la imagen ---
$config = Get-Content $configPath -Raw
function Leer([string]$nombre) {
	$match = [regex]::Match($config, "#define\s+$nombre\s+`"([^`"]*)`"")
	if ($match.Success) { return $match.Groups[1].Value } else { return '' }
}
$url = Leer 'RURAL_API_URL'
$version = Leer 'RURAL_FIRMWARE_VERSION'
$clave = Leer 'RURAL_PROVISIONING_KEY'
$intervalo = [regex]::Match($config, '#define\s+PHOTO_INTERVAL_MS\s+(\d+)').Groups[1].Value

if (-not $url) { throw 'RURAL_API_URL no está definido en config.h.' }
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'RURAL_FIRMWARE_VERSION debe tener el formato X.Y.Z.' }
if (-not $clave -or $clave -like 'PEGA_AQUI*') { throw 'Completa RURAL_PROVISIONING_KEY en config.h.' }
$esLocal = $url -match '^https?://(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)'
if ($esLocal -and -not $PermitirLocal) {
	throw "La imagen apunta a un servidor local ($url). Para producción usa https://rural40.ml-ware.com; para pruebas locales agrega -PermitirLocal."
}

Write-Host "Servidor en la imagen : $url"
Write-Host "Versión               : $version"
Write-Host ("Foto cada             : {0} s" -f ([int64]$intervalo / 1000))
if ([int64]$intervalo -lt 600000) { Write-Warning 'El intervalo de fotos es de prueba (menos de 10 min). Para uso real usa 7200000UL (2 h).' }

# --- Herramientas de PlatformIO ---
$pioHome = Join-Path $env:USERPROFILE '.platformio'
$pio = (Get-Command pio -ErrorAction SilentlyContinue).Source
if (-not $pio) { $pio = Join-Path $pioHome 'penv\Scripts\pio.exe' }
if (-not (Test-Path $pio)) { throw 'No se encontró PlatformIO (pio). Instálalo o abre este script desde la terminal de PlatformIO en VS Code.' }
$python = Join-Path $pioHome 'penv\Scripts\python.exe'
$esptool = Join-Path $pioHome 'packages\tool-esptoolpy\esptool.py'
$bootApp0 = Join-Path $pioHome 'packages\framework-arduinoespressif32\tools\partitions\boot_app0.bin'

# --- Compilar ---
Push-Location $proyecto
try {
	& $pio run -e esp32cam
	if ($LASTEXITCODE -ne 0) { throw 'La compilación falló.' }
} finally {
	Pop-Location
}
$build = Join-Path $proyecto '.pio\build\esp32cam'
foreach ($archivo in @((Join-Path $build 'bootloader.bin'), (Join-Path $build 'partitions.bin'), (Join-Path $build 'firmware.bin'), $bootApp0, $esptool)) {
	if (-not (Test-Path $archivo)) { throw "No se encontró $archivo" }
}

# --- Publicar con los mismos nombres y direcciones que el sensor ---
New-Item -ItemType Directory -Force -Path $Destino | Out-Null
Copy-Item (Join-Path $build 'bootloader.bin') (Join-Path $Destino 'bootloader.bin') -Force
Copy-Item (Join-Path $build 'partitions.bin') (Join-Path $Destino 'partitions.bin') -Force
Copy-Item $bootApp0 (Join-Path $Destino 'boot_app0.bin') -Force
Copy-Item (Join-Path $build 'firmware.bin') (Join-Path $Destino 'application.bin') -Force

& $python $esptool --chip esp32 merge_bin -o (Join-Path $Destino 'first-flash.bin') --flash_mode dio --flash_freq 40m --flash_size 4MB `
	0x1000 (Join-Path $Destino 'bootloader.bin') `
	0x8000 (Join-Path $Destino 'partitions.bin') `
	0xe000 (Join-Path $Destino 'boot_app0.bin') `
	0x10000 (Join-Path $Destino 'application.bin')
if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar first-flash.bin.' }

$manifest = [ordered]@{
	version = $version
	placa = 'AI-Thinker ESP32-CAM (ESP32-D0WD, 4 MB, PSRAM)'
	flash_size_bytes = 4194304
	servidor = $url
	recomendada = [ordered]@{ archivo = 'first-flash.bin'; direccion = '0x0'; descripcion = 'Imagen combinada para primera instalacion completa de la camara' }
	componentes = @(
		[ordered]@{ archivo = 'bootloader.bin'; direccion = '0x1000' },
		[ordered]@{ archivo = 'partitions.bin'; direccion = '0x8000' },
		[ordered]@{ archivo = 'boot_app0.bin'; direccion = '0xE000' },
		[ordered]@{ archivo = 'application.bin'; direccion = '0x10000' }
	)
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $Destino 'manifest.json') -Encoding UTF8

Write-Host ''
Write-Host "Imagen publicada en: $((Resolve-Path $Destino).Path)"
Get-ChildItem $Destino | Select-Object Name, Length | Format-Table -AutoSize
Write-Host 'Siguiente paso:'
Write-Host '  - Local: recarga el dashboard; "Dispositivo nuevo" > ESP32-CAMERA ya muestra la descarga.'
Write-Host '  - Plesk: sube esta carpeta a httpdocs/src/backend/esp32-firmware/camara/first-install/.'
