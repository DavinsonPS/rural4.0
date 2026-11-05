# Firmware Rural 4.0

Esta carpeta contiene la documentación versionada y los artefactos compilados locales que se
publican manualmente en Plesk. No se modifica desde el dashboard. Los binarios se excluyen de
Git porque pueden llevar claves y configuración compiladas.

## Archivos que deben quedar en el servidor

Para el ESP32 de sensores, en `src/backend/esp32-firmware/`:

- `firmware.bin`: aplicación para OTA.
- `manifest.json`: versión, tamaño y SHA-256 de `firmware.bin`.
- `first-install/first-flash.bin`: imagen completa para primera instalación por USB.
- `first-install/bootloader.bin`, `partitions.bin`, `boot_app0.bin` y `application.bin`: alternativa de instalación por componentes.
- `first-install/manifest.json`: versión, placa y direcciones de los componentes.

Para usar cámaras, publica además su propio conjunto en `camara/`: `firmware.bin`,
`manifest.json` y `first-install/` con los mismos nombres. No mezcles imágenes de cámara y
sensores. Los binarios de cámara de primera instalación también se generan localmente y están
excluidos de Git.

La carpeta `esp32-firmware/` del repositorio conserva los README y manifiestos de metadatos, pero
los binarios se generan o copian localmente y se suben a mano a Plesk. El paquete general de
despliegue no incluye estos archivos.

## Generar y publicar el firmware de sensores

1. En `esp32/sketch/sketch.ino`, asigna a `FIRMWARE_VERSION` una versión mayor que la instalada.
2. Compila el sketch con la placa `ESP32 Dev Module`. Desde la raíz del repositorio, también
   puedes usar Arduino CLI:

   ```powershell
   $fqbn = 'esp32:esp32:esp32:UploadSpeed=921600,CPUFreq=240,FlashFreq=80,FlashMode=qio,FlashSize=4M,PartitionScheme=default,DebugLevel=none,PSRAM=disabled,LoopCore=1,EventsCore=1,EraseFlash=all,JTAGAdapter=default,ZigbeeMode=default'
   arduino-cli compile --fqbn $fqbn --build-path .\esp32\sketch\build\esp32.esp32.esp32 .\esp32\sketch
   ```

3. Copia las salidas de compilación al directorio de publicación:

   ```powershell
   $build = '.\esp32\sketch\build\esp32.esp32.esp32'
   $target = '.\src\backend\esp32-firmware'
   Copy-Item "$build\sketch.ino.bin" "$target\firmware.bin"
   Copy-Item "$build\sketch.ino.bin" "$target\first-install\application.bin"
   Copy-Item "$build\sketch.ino.merged.bin" "$target\first-install\first-flash.bin"
   Copy-Item "$build\sketch.ino.bootloader.bin" "$target\first-install\bootloader.bin"
   Copy-Item "$build\sketch.ino.partitions.bin" "$target\first-install\partitions.bin"
   Copy-Item "$build\boot_app0.bin" "$target\first-install\boot_app0.bin"
   ```

4. Desde `src/backend`, genera el manifiesto OTA con la misma versión del sketch:

   ```powershell
   npm run firmware:manifest -- 1.0.7
   ```

   Cambia `1.0.7` por la versión que acabas de compilar. El comando calcula tamaño y SHA-256 del
   firmware OTA y sincroniza la versión de `first-install/manifest.json`; las direcciones y la
   placa no cambian.

5. Sube manualmente a Plesk `firmware.bin`, `manifest.json` y toda la carpeta `first-install/`,
   conservando los nombres y rutas. La ruta física corresponde a
   `httpdocs/src/backend/esp32-firmware/`.

El binario `firmware.bin` es solo la aplicación OTA; **no** lo uses como imagen completa en
`0x0`. Para primera instalación, `first-flash.bin` se programa en `0x0`; los componentes
individuales se escriben en las direcciones de `first-install/manifest.json`.

## Comportamiento del firmware

La versión usa WiFiManager para redes de 2.4 GHz. Si al arrancar no puede conectarse a la red
guardada, el ESP32 crea `Rural40-Setup`; durante el funcionamiento reintenta la red guardada sin
abrir el portal. Al arrancar conectado, sincroniza el RTC con NTP en hora de Colombia (UTC-5);
si falla NTP, conserva la hora del RTC.

El ESP32 reporta `FIRMWARE_VERSION` al provisionarse y en las solicitudes autenticadas. Después
de iniciar o actualizarse por OTA, también llama `POST /api/dispositivos/version`; el servidor
confirma la versión guardada en `tbld_dispositivos.version_firmware`, visible en la tabla de
dispositivos del administrador.
