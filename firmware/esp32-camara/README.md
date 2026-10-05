# Firmware ESP32-CAMERA · Rural 4.0

Firmware para la **AI-Thinker ESP32-CAM**. Toma una foto cada `PHOTO_INTERVAL_MS` y la
envía al proyecto al que está vinculada. Sigue la misma metodología que el firmware de
sensores: WiFiManager, provisión automática y `Preferences` (`rural40`).

## Preparar

1. Copia `include/config.example.h` como `include/config.h`.
2. En `config.h` pega la clave de provisión: el valor de `DEVICE_PROVISIONING_KEY` del
   `.env` del servidor (la misma que usa el firmware de sensores).
3. Revisa `PHOTO_INTERVAL_MS`: **60 s es solo para pruebas** (~1.440 fotos y ~85 MB por
   día y por cámara). Para uso real: `7200000UL` (2 horas).

`config.h` no se sube a git.

## Publicar la imagen (mismo proceso que los sensores)

Quien mantiene el firmware (docente o administrador) compila y publica una sola vez:

```
powershell -ExecutionPolicy Bypass -File publicar-imagen.ps1
```

El script compila con PlatformIO y deja en `src/backend/esp32-firmware/camara/first-install/`
la imagen combinada `first-flash.bin` (para `0x0`), los componentes (`bootloader.bin`,
`partitions.bin`, `boot_app0.bin`, `application.bin`) y `manifest.json`, con los mismos nombres
y direcciones que la del sensor. Se niega a publicar una imagen que apunte a una IP local, salvo
con `-PermitirLocal` (para pruebas contra el servidor de tu PC).

En Plesk, esa carpeta se sube a mano a `httpdocs/src/backend/esp32-firmware/camara/first-install/`.

Desde ese momento el **estudiante** hace lo mismo que con el ESP32 de sensores:
*Vincular dispositivo* → *Dispositivo nuevo* → **ESP32-CAMERA** → descargar la imagen →
instalarla con esptool-js en `0x0` → configurar el Wi-Fi → vincularla.

## Cargar directo desde PlatformIO (solo desarrollo)

Con el adaptador ESP32-CAM-MB (o un FTDI con IO0 a GND para programar):

```
pio run -t upload
pio device monitor
```

## Primer arranque

1. La placa abre la red **`Rural40-Camera-Setup`**. Conéctate y entra a `http://192.168.4.1`.
2. Elige tu Wi-Fi de **2.4 GHz** y su contraseña. La URL del servidor ya viene en el firmware.
3. Se provisiona sola. El monitor serial muestra el **código interno** (`CAM-XXXXXXXX`) y el
   **código de vinculación**.
4. En el dashboard del estudiante: *Vincular dispositivo* → tipo **ESP32-CAMERA** →
   *Buscar* → elegir la cámara → *Vincular al proyecto*.
5. En máximo un minuto empieza a enviar fotos (el LED rojo parpadea una vez por foto enviada).

Mensajes esperados en el monitor serial:

```
Wi-Fi conectado. IP: 192.168.1.x
Dispositivo provisionado. API key guardada localmente.
Vinculada al proyecto "Huerta Escolar". Empiezan las fotos.
API foto (53120 bytes): HTTP 201
```

## Reiniciar la configuración

Mantén presionado **IO0** (botón del ESP32-CAM-MB) al encender durante 3 segundos: se
borran el Wi-Fi y la clave, y la placa vuelve a abrir el portal y a provisionarse.

## Comportamiento

| Situación | Qué hace |
|---|---|
| Sin clave guardada | Se provisiona (`POST /api/dispositivos/provisionar`, modelo `ESP32-CAMERA`) |
| Sin vincular | Consulta `/api/dispositivos/configuracion` cada minuto; no toma fotos |
| Vinculada | Foto SVGA 800×600 (calidad 12) a `POST /api/monitoreo/fotografias` como JPEG crudo |
| Sin Internet | Guarda hasta 30 fotos en la microSD y las envía al reconectar |
| Clave rechazada 3 veces | La descarta y se vuelve a provisionar |
| Desactivada por el administrador | La provisión responde 403 y la placa espera |

## OTA

Desactivado (`ENABLE_OTA 0`): la tabla `huge_app.csv` no tiene partición OTA. El servidor
entrega a cada modelo su propio firmware (`esp32-firmware/camara/` para la cámara), así que
una cámara nunca recibe el programa del sensor. Para activar OTA: cambiar a una tabla con dos
particiones de aplicación (p. ej. `min_spiffs.csv`, si el binario cabe en 1.9 MB), poner
`ENABLE_OTA 1`, y publicar `firmware.bin` + `manifest.json` en `esp32-firmware/camara/`.

## Servidor

La URL del servidor es siempre la compilada en `config.h` (como en el sensor, el portal solo pide
el Wi-Fi). Si la placa se movió de servidor (por ejemplo, de pruebas locales a producción), al
arrancar descarta su clave anterior y se vuelve a provisionar sola.
