# Configuración inicial del ESP32 con firmware desde rural40

Este documento explica cómo cargar el firmware binario al ESP32 y cómo dejarlo listo para conectarse a la API de Rural 4.0.

## 1. Requisitos

- Una placa ESP32 conectada por USB al equipo
- La imagen `first-install/first-flash.bin` para primera instalación USB
- Un navegador moderno
- Opcional: `esptool` si prefieres hacerlo desde consola
- Una red Wi-Fi de 2.4 GHz con acceso a internet
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

Para la primera instalación por USB, descarga `GET /api/firmware/download-inicial`. Ese endpoint entrega la imagen combinada `first-flash.bin`; no es el binario OTA.

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
3. Descarga `first-flash.bin` desde el panel de primera instalación.
4. Haz clic en `Connect` y selecciona el puerto COM / serial del ESP32.
5. Agrega `first-flash.bin` en la lista de archivos y cambia `Flash Address` a `0x0`.
6. Pulsa `Program` y espera a que termine la escritura.
7. Si no entra en modo de programación, mantén `BOOT`, pulsa y suelta `EN`/`RESET` y luego suelta `BOOT`.
8. Cuando termine, desconecta el USB, espera unos segundos y vuelve a conectarlo para reiniciar el ESP32.

### Importante

No dejes la dirección predeterminada `0x1000` al cargar la imagen combinada. La imagen OTA `firmware.bin` es solo la aplicación y no se usa para el primer flasheo. Este proceso requiere USB físico; no se flashea por WiFi al primer arranque.

Como alternativa avanzada, se pueden cargar los cuatro componentes individuales desde `first-install/` con estas direcciones:

| Archivo | Dirección |
|---|---:|
| `bootloader.bin` | `0x1000` |
| `partitions.bin` | `0x8000` |
| `boot_app0.bin` | `0xE000` |
| `application.bin` | `0x10000` |

---

## 4. Configuración Wi-Fi del ESP32 físico

Después de cargar el firmware, desconecta y vuelve a conectar el USB para reiniciar la placa. En el primer arranque, si no tiene una red guardada, creará una red temporal llamada:

```text
Rural40-Setup
```

1. Espera a que aparezca `Rural40-Setup` en las redes Wi-Fi disponibles.
2. Conecta el celular o computador a esa red. Si el sistema avisa que no hay internet, selecciona permanecer conectado; es normal porque esta red solo abre el portal de configuración.
3. Abre en el navegador:

```text
http://192.168.4.1
```

4. En el portal configura:

```text
SSID: tu red Wi-Fi de 2.4 GHz
Contraseña: contraseña de tu router
```

La URL de Rural 4.0 ya está configurada en el firmware y no se solicita en el portal.

5. Guarda la configuración y espera a que la placa se reinicie o cierre el portal. El teléfono puede volver a conectarse a su red Wi-Fi habitual.

El portal solo solicita el nombre y la contraseña de la red Wi-Fi. La clave del dispositivo se obtiene automáticamente durante la provisión y se guarda en la placa; no es necesario ingresarla. Si la placa conserva credenciales Wi-Fi anteriores y no crea el portal, borra la memoria flash antes de cargar el firmware o restablece su configuración Wi-Fi.

Para comprobar el arranque, abre el monitor serial a `115200` baudios antes de reiniciar o reconectar el USB.

El monitor serial debe mostrar mensajes similares a:

```text
Conectando a Wi-Fi guardado o abriendo Rural40-Setup...
Wi-Fi conectado. IP: 192.168.1.x
Dispositivo provisionado. API key guardada localmente.
API lectura: HTTP 201
```

## 5. Opción alternativa: flasheo por línea de comandos

Si prefieres `esptool` desde consola:

### Windows

```powershell
esptool.py --chip esp32 --port COM3 --baud 460800 write_flash 0x1000 .\bootloader.bin 0x8000 .\partitions.bin 0xE000 .\boot_app0.bin 0x10000 .\application.bin
```

### Linux / macOS

```bash
esptool.py --chip esp32 --port /dev/ttyUSB0 --baud 460800 write_flash 0x1000 ./bootloader.bin 0x8000 ./partitions.bin 0xE000 ./boot_app0.bin 0x10000 ./application.bin
```

Si no tienes `esptool` instalado:

```bash
pip install esptool
```

---

## 6. Verificar que la placa quedó cargada

Después de cargar el firmware, reinicia el ESP32 y revisa que: 

- se conecta a una red Wi-Fi de 2.4 GHz
- puede resolver la URL pública de la API
- hace la solicitud de registro o de OTA si aplica
- envia las lecturas con la API key correcta
- si un sensor no está conectado, envía el valor `0` y continúa funcionando

En el backend, la API para firmware OTA queda en:

```text
/api/firmware/latest
/api/firmware/download
```

---

## 7. Flujo recomendado para el proyecto

1. Compila el firmware final.
2. Guarda el binario en la ruta del servidor: `rural40.ml-ware.com/httpdocs/src/backend/esp32-firmware/firmware.bin`.
3. Ejecuta la generación del manifiesto desde la raíz del proyecto del servidor:

```bash
cd /home/usuario/public_html/rural40.ml-ware.com/httpdocs/src/backend
npm run firmware:manifest -- 1.0.1
```

4. Verifica que `manifest.json` tenga:

```json
{
   "version": "1.0.1",
  "sha256": "HASH_SHA256_DEL_FIRMWARE",
  "tamano_bytes": 123456,
  "obligatoria": false
}
```

5. Para primera instalación, publica también todos los archivos de `first-install/` sin cambiar sus nombres.
6. Flashea `first-flash.bin` por USB en `0x0`, o carga los cuatro componentes en sus offsets documentados.
7. El ESP32 intenta conectarse a la red y luego se registra con la API.
8. El sistema puede actualizar firmware por OTA cuando sea necesario.

---

## 8. Recomendación para usuarios no técnicos

Para alumnos o docentes, lo más sencillo es:

- entregarles `first-flash.bin` para la primera carga por USB y especificar `Flash Address: 0x0`
- reservar `firmware.bin` para las actualizaciones OTA del dispositivo
- no exigirles que compilen ni instalen bibliotecas si no es necesario

Esto reduce la fricción y evita errores de configuración.

---

## 9. Resumen

- El primer firmware se carga por USB.
- La carga por internet/OTA solo sirve después de que el dispositivo ya tiene firmware instalado.
- El proyecto ya soporta OTA y validación del firmware, pero la primera instalación requiere un flasheo inicial.
- La herramienta web `esptool-js` es una buena opción para usuarios que quieran cargar el binario sin instalar software pesado.
