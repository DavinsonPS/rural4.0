# Firmware Rural 4.0

Esta carpeta es administrada por los desarrolladores. No se modifica desde el dashboard.

Archivos requeridos:

- `firmware.bin`: firmware OTA vigente.
- `manifest.json`: metadatos de la versión publicada.

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

El endpoint OTA siempre lee estos dos archivos; no existe carga de firmware desde el dashboard.
