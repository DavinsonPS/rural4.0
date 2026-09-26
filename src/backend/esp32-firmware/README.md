# Firmware Rural 4.0

Esta carpeta es administrada por los desarrolladores. No se modifica desde el dashboard.

Archivos requeridos:

- `firmware.bin` y `manifest.json`: firmware y metadatos para actualizaciones OTA.
- `first-install/`: imagen combinada, archivos individuales de flasheo inicial y su manifiesto.

La versión vigente usa WiFiManager para configurar redes físicas de 2.4 GHz. Si no hay credenciales guardadas, el ESP32 crea la red temporal `Rural40-Setup` y permite configurar la URL `https://rural40.ml-ware.com` desde `http://192.168.4.1`.

Ejemplo de `manifest.json`:

```json
{
  "version": "1.0.1",
  "sha256": "HASH_SHA256_DEL_FIRMWARE",
  "tamano_bytes": 123456,
  "obligatoria": false
}
```

El hash y el tamaño deben corresponder exactamente a `firmware.bin`. El backend rechaza el manifiesto si no coinciden.

Para publicar una nueva versión, copia el binario compilado como `firmware.bin` y ejecuta desde `src/backend`:

```powershell
npm run firmware:manifest -- 1.0.1
```

El firmware OTA se publica en `firmware.bin`; su manifiesto debe reflejar exactamente su tamaño y SHA-256. Para actualizar OTA, copia el binario de aplicación compilado a esa ruta y regenera el manifiesto.

## Primera instalación por USB

La carpeta `first-install/` contiene una imagen combinada `first-flash.bin` para esptool-js y los componentes individuales. La imagen combinada se programa en `0x0`. Si se cargan los componentes por separado, usa las direcciones listadas en `first-install/manifest.json`.

El dashboard descarga la imagen combinada desde `GET /api/firmware/download-inicial`. Los componentes se descargan desde `GET /api/firmware/first-install/files/:filename`. No uses el `firmware.bin` OTA en `0x1000`: ese archivo contiene solo la aplicación y su dirección de componente es `0x10000`.
