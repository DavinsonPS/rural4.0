# Arma el zip que se sube a Plesk (httpdocs/src) con SOLO el código de la aplicación.
# Excluye todo lo que pertenece al entorno de ejecución o a producción:
#   .env, .plesk.startup.cjs, tmp/, .node-version, uploads/, node_modules/,
#   esp32-firmware/, migraciones/, tests/, logs y volcados SQL.
#
# Uso (desde la raíz del proyecto, en PowerShell):
#   powershell -ExecutionPolicy Bypass -File scripts\empaquetar-despliegue.ps1
#
# Resultado: despliegue\rural40-AAAAMMDD-HHMM.zip con rutas src/backend/... y src/frontend/...
# Extraerlo en httpdocs/ del dominio (no dentro de src/).

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'src\backend'
$frontend = Join-Path $root 'src\frontend'

$backendFiles = @('server.js', 'db.js', 'session.js', 'package.json', 'package-lock.json')
$backendFolders = @('config', 'lib', 'middlewares', 'policies', 'services', 'repositories', 'routes', 'scripts')

$outputFolder = Join-Path $root 'despliegue'
New-Item -ItemType Directory -Force -Path $outputFolder | Out-Null
$zipPath = Join-Path $outputFolder ("rural40-{0}.zip" -f (Get-Date -Format 'yyyyMMdd-HHmm'))
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$entries = New-Object System.Collections.Generic.List[object]
foreach ($file in $backendFiles) {
	$entries.Add(@{ Source = (Join-Path $backend $file); Entry = "src/backend/$file" })
}
foreach ($folder in $backendFolders) {
	Get-ChildItem -Path (Join-Path $backend $folder) -Recurse -File | ForEach-Object {
		$relative = $_.FullName.Substring($backend.Length + 1).Replace('\', '/')
		$entries.Add(@{ Source = $_.FullName; Entry = "src/backend/$relative" })
	}
}
Get-ChildItem -Path $frontend -Recurse -File | ForEach-Object {
	$relative = $_.FullName.Substring($frontend.Length + 1).Replace('\', '/')
	$entries.Add(@{ Source = $_.FullName; Entry = "src/frontend/$relative" })
}

# ZipArchive con separador '/' para que Plesk (Linux) extraiga carpetas y no nombres con '\'.
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
	foreach ($item in $entries) {
		if (-not (Test-Path $item.Source)) { throw "No existe: $($item.Source)" }
		[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $item.Source, $item.Entry, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
	}
} finally {
	$zip.Dispose()
}

Write-Host "Paquete creado: $zipPath"
Write-Host "Archivos incluidos: $($entries.Count)"
Write-Host ''
Write-Host 'Recuerda en Plesk:'
Write-Host '  1. Respaldo de httpdocs/src y export de rural40_db antes de subir.'
Write-Host '  2. Importar migraciones pendientes (src/backend/migraciones/*.sql) en phpMyAdmin.'
Write-Host '  3. Extraer este zip en httpdocs/ sobrescribiendo.'
Write-Host '  4. NPM install solo si cambió package.json.'
Write-Host '  5. Restart App (o actualizar src/backend/tmp/restart.txt).'
