# esp32-camara/ — obsoleto

Este directorio contiene el **sketch original de Arduino** de la ESP32-CAM. Quedó reemplazado por el
firmware nuevo en [`firmware/esp32-camara/`](../firmware/esp32-camara/README.md), y se conserva solo
como referencia histórica.

## Por qué se reemplazó

| Sketch antiguo | Firmware nuevo (`firmware/esp32-camara`) |
|---|---|
| Se instalaba con el IDE de Arduino | Se instala desde el dashboard (imagen descargable + esptool-js en `0x0`), igual que el sensor |
| Formato de captura fijo en JPEG: falla con sensores que no lo generan (p. ej. GC2145) | Genera el JPEG por software si el sensor no lo hace (probado con GC2145) |
| XCLK a 20 MHz fijo | XCLK a 10 MHz y lectura `GRAB_WHEN_EMPTY`, más estable con sensores GC2145 |
| La clave del dispositivo se escribe a mano en el portal Wi-Fi | Aprovisionamiento automático: el dispositivo obtiene su clave solo y se vincula con un código |
| Sin actualización de firmware desde el servidor | Imagen publicable por modelo (`/api/firmware`, `?tipo=camara`) |
| Una sola foto pendiente en microSD (`/pending.jpg`) | Cola de hasta 30 fotos pendientes en microSD, con reintentos y tolerancia a redes débiles |

## Qué hacer

- Para cámaras nuevas: usa `firmware/esp32-camara` y el flujo descrito en `DESPLIEGUE-PLESK.md`.
- `diagram.json` y `libraries.txt` de esta carpeta no se mantienen.
- Si nadie necesita ya este sketch como referencia, se puede borrar este directorio.
