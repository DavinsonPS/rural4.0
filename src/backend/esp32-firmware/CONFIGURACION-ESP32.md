# Configuración inicial del ESP32 con firmware desde rural40

Este documento explica cómo cargar el firmware binario al ESP32 y cómo dejarlo listo para conectarse a la API de Rural 4.0.

## 1. Requisitos

- Una placa ESP32 conectada por USB al equipo
- El archivo `firmware.bin` generado en esta carpeta
- Un navegador moderno
- Opcional: `esptool` si prefieres hacerlo desde consola
- Acceso a la API de Rural 4.0 en el servidor real

La ruta real del proyecto en el servidor es:

- `/httpdocs/src/backend/esp32-firmware/firmware.bin`
- equivalentes a la estructura del repositorio: `src/backend/esp32-firmware/firmware.bin`

---

## 2. Descargar el firmware desde el servidor

La API expone el firmware publicado en estos endpoints:

- `GET /api/firmware/latest`
- `GET /api/firmware/download`

Estos endpoints validan:

- la clave `X-Device-Key`
- el hash SHA-256 del archivo
- el tamaño en bytes
- la versión publicada

En el servidor de producción, la URL base es:

```text
https://rural40.ml-ware.com/api/firmware/download
```

Y la ruta física del proyecto en el hosting es:

```text
/home/usuario/public_html/rural40.ml-ware.com/httpdocs/src/backend/esp32-firmware/
```

En este entorno, la referencia correcta para la raíz del proyecto es:

```text
rural40.ml-ware.com/httpdocs/src
```

---

## 3. Opción recomendada: flasheo desde navegador con esptool-js

Usa la herramienta web oficial de Espressif:

```text
https://espressif.github.io/esptool-js/
```

### Pasos

1. Conecta el ESP32 al puerto USB del equipo.
2. Abre la página de esptool-js.
3. En la interfaz selecciona:
   - el puerto COM / serial del ESP32
   - el archivo `firmware.bin`
4. Haz clic en `Connect` o `Conectar`.
5. Si el ESP32 no entra en modo de programación, presiona:
   - `BOOT` + `EN`/`RESET`
   - o usa el botón de bootloader del módulo
6. Selecciona el binario en la sección de upload.
7. Inicia la carga.
8. Cuando termine, reinicia la placa.

### Importante

Este proceso es por USB físico. No se flashea por WiFi al primer arranque.

---

## 4. Opción alternativa: flasheo por línea de comandos

Si prefieres `esptool` desde consola:

### Windows

```powershell
esptool.py --chip esp32 --port COM3 --baud 460800 write_flash 0 .\firmware.bin
```

### Linux / macOS

```bash
esptool.py --chip esp32 --port /dev/ttyUSB0 --baud 460800 write_flash 0 ./firmware.bin
```

Si no tienes `esptool` instalado:

```bash
pip install esptool
```

---

## 5. Verificar que la placa quedó cargada

Después de cargar el firmware, reinicia el ESP32 y revisa que: 

- se conecta a WiFi
- puede resolver la URL pública de la API
- hace la solicitud de registro o de OTA si aplica
- envia las lecturas con la API key correcta

En el backend, la API para firmware OTA queda en:

```text
/api/firmware/latest
/api/firmware/download
```

---

## 6. Flujo recomendado para el proyecto

1. Compila el firmware final.
2. Guarda el binario en la ruta del servidor: `rural40.ml-ware.com/httpdocs/src/backend/esp32-firmware/firmware.bin`.
3. Ejecuta la generación del manifiesto desde la raíz del proyecto del servidor:

```bash
cd /home/usuario/public_html/rural40.ml-ware.com/httpdocs/src/backend
npm run firmware:manifest -- 1.0.0
```

4. Verifica que `manifest.json` tenga:

```json
{
  "version": "1.0.0",
  "sha256": "HASH_SHA256_DEL_FIRMWARE",
  "tamano_bytes": 123456,
  "obligatoria": false
}
```

5. Flashea esa imagen al ESP32 por USB.
6. El ESP32 intenta conectarse a la red y luego se registra con la API.
7. El sistema puede actualizar firmware por OTA cuando sea necesario.

---

## 7. Recomendación para usuarios no técnicos

Para alumnos o docentes, lo más sencillo es:

- entregar el `firmware.bin` final
- indicarles que lo carguen desde esptool-js o con el flasher de su preferencia
- no exigirles que compilen ni instalen bibliotecas si no es necesario

Esto reduce la fricción y evita errores de configuración.

---

## 8. Resumen

- El primer firmware se carga por USB.
- La carga por internet/OTA solo sirve después de que el dispositivo ya tiene firmware instalado.
- El proyecto ya soporta OTA y validación del firmware, pero la primera instalación requiere un flasheo inicial.
- La herramienta web `esptool-js` es una buena opción para usuarios que quieran cargar el binario sin instalar software pesado.
