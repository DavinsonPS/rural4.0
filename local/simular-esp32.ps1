# Simula un ESP32 contra el servidor LOCAL, usando las mismas rutas y headers del firmware:
#   1. POST /api/dispositivos/provisionar  (X-Provisioning-Key)  → recibe api_key y código
#   2. Esperas a que lo vincules desde el dashboard del estudiante o del docente
#   3. Envía lecturas (sensor) o fotos JPEG (cámara) con X-Device-Key
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File local\simular-esp32.ps1                      # sensor
#   powershell -ExecutionPolicy Bypass -File local\simular-esp32.ps1 -Tipo camara -Foto C:\ruta\foto.jpg
#   -SensorDesconectado  envía temperatura y humedad del aire en 0 (como el firmware sin sensor)
param(
	[ValidateSet('sensor', 'camara')] [string]$Tipo = 'sensor',
	[string]$Servidor = 'http://localhost:3000',
	[string]$ClaveProvision = 'provision-local',
	[string]$Mac = '',
	[int]$Intervalo = 10,
	[string]$Foto = '',
	[switch]$SensorDesconectado
)

$ErrorActionPreference = 'Stop'
if (-not $Mac) {
	$bytes = 1..6 | ForEach-Object { '{0:X2}' -f (Get-Random -Minimum 0 -Maximum 256) }
	$Mac = ($bytes -join ':')
}
$modelo = if ($Tipo -eq 'camara') { 'ESP32-CAMERA' } else { 'ESP32' }

Write-Host "Provisionando $modelo con MAC $Mac ..."
$provision = Invoke-RestMethod -Method Post -Uri "$Servidor/api/dispositivos/provisionar" `
	-Headers @{ 'X-Provisioning-Key' = $ClaveProvision } -ContentType 'application/json' `
	-Body (@{ mac_address = $Mac; modelo = $modelo; version_firmware = '1.0.1-sim' } | ConvertTo-Json)

Write-Host ''
Write-Host "  Código interno:      $($provision.codigo_interno)"
Write-Host "  Código vinculación:  $($provision.codigo_vinculacion)"
Write-Host ''
Write-Host 'Ahora vincúlalo desde el dashboard (Vincular dispositivo → Buscar) eligiendo el tipo correcto.'
Read-Host 'Presiona Enter cuando esté vinculado'

$headers = @{ 'X-Device-Key' = $provision.api_key }
$configuracion = Invoke-RestMethod -Uri "$Servidor/api/dispositivos/configuracion" -Headers $headers
Write-Host "Configuración recibida: proyecto $($configuracion.proyecto_id) · LED $($configuracion.configuracion_led) $($configuracion.color_led) · tierra $($configuracion.tipo_tierra)"
Write-Host "Enviando cada $Intervalo s. Ctrl+C para detener."

while ($true) {
	try {
		if ($Tipo -eq 'sensor') {
			$lectura = @{
				fecha_lectura = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
				temperatura_c = if ($SensorDesconectado) { 0 } else { [math]::Round((Get-Random -Minimum 180 -Maximum 300) / 10, 1) }
				humedad_ambiente_pct = if ($SensorDesconectado) { 0 } else { Get-Random -Minimum 50 -Maximum 85 }
				humedad_suelo_pct = Get-Random -Minimum 20 -Maximum 90
				intensidad_luz_lux = Get-Random -Minimum 0 -Maximum 800
			}
			$respuesta = Invoke-RestMethod -Method Post -Uri "$Servidor/api/monitoreo/lecturas" -Headers $headers -ContentType 'application/json' -Body ($lectura | ConvertTo-Json)
			Write-Host ("{0}  lectura enviada: {1} °C, suelo {2} %, luz {3} lx → {4}" -f (Get-Date -Format 'HH:mm:ss'), $lectura.temperatura_c, $lectura.humedad_suelo_pct, $lectura.intensidad_luz_lux, $respuesta.status)
		} else {
			if (-not $Foto -or -not (Test-Path $Foto)) { throw 'Indica una foto JPEG existente con -Foto C:\ruta\foto.jpg' }
			$respuesta = Invoke-RestMethod -Method Post -Uri "$Servidor/api/monitoreo/fotografias" -Headers $headers -ContentType 'image/jpeg' -InFile $Foto
			Write-Host ("{0}  foto enviada → {1}" -f (Get-Date -Format 'HH:mm:ss'), $respuesta.ruta)
		}
	} catch {
		Write-Host ("{0}  error: {1}" -f (Get-Date -Format 'HH:mm:ss'), $_.Exception.Message) -ForegroundColor Yellow
	}
	Start-Sleep -Seconds $Intervalo
}
