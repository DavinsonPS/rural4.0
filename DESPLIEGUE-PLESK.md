# Despliegue en Plesk — Rural 4.0 versión 2

Guía para pasar de la versión que corre hoy en Plesk (la original) a la nueva. Detalle de los
cambios en `CAMBIOS.md`. Este documento **no se sube a Plesk**.

Tiempo estimado: 30–45 minutos. Hazlo en un horario sin clases: la app se reinicia unos segundos.

---

## Antes de empezar

- [ ] Tener en el equipo:
  - el zip `despliegue/rural40-AAAAMMDD-HHMM.zip`, generado con `scripts/empaquetar-despliegue.ps1`;
  - las 3 migraciones de `src/backend/migraciones/`.
- [ ] En Plesk, abrir `httpdocs/src/backend/.env` y confirmar que tiene `SESSION_SECRET` y `APP_URL=https://rural40.ml-ware.com`. Agregar `OPENAI_API_KEY` y `MODELO` para habilitar el agente Guardián.
- [ ] Confirmar que `DB_USER` puede leer las tablas de proyectos, lecturas, bitácoras y aprendizaje que consulta MCP, y guardar conversaciones en `tblh_guardian_conversaciones` y `tblh_guardian_mensajes`.
- [ ] Las dependencias cambiaron: después de reemplazar el código, ejecutar **NPM install** en Plesk para la aplicación cuya raíz es `httpdocs/src/backend`.
- [ ] El MCP integrado usa la sesión de la aplicación y no requiere otro proceso, puerto ni `MCP_SERVICE_TOKEN` en producción.

---

## Paso 1 · Respaldo (obligatorio)

1. **Base de datos:** phpMyAdmin → `rural40_db` → **Exportar** → método *Rápido*, formato SQL → descargar.
2. **Archivos:** Administrador de archivos → seleccionar `httpdocs/src` → **Agregar al archivo (zip)** → descargar.

Guarda ambos: son la vuelta atrás.

---

## Paso 2 · Base de datos (phpMyAdmin)

Seleccionar `rural40_db` → **Importar**, un archivo a la vez, **en este orden**, con
*Conjunto de caracteres del archivo: utf-8*:

| Orden | Archivo |
|---|---|
| 1 | `001_base.sql` |
| 2 | `002_auditoria.sql` |
| 3 | `003_cuestionarios.sql` |

Al final, en la pestaña SQL, ejecutar:

```sql
SELECT * FROM tbl_migraciones;                      -- deben aparecer 001_base, 002_auditoria, 003_cuestionarios
SELECT COUNT(*) FROM tblh_preguntas WHERE id_docente IS NULL;   -- debe dar 30
```

Antes de activar el chat, confirmar también que las tablas de conversaciones existen:

```sql
SHOW TABLES LIKE 'tblh_guardian_conversaciones';
SHOW TABLES LIKE 'tblh_guardian_mensajes';
```

Si falta alguna, detén la activación del chat y solicita/prepara la migración de esquema correspondiente
antes de continuar: el paquete de esta versión no incluye una migración para crear esas tablas.

Si una importación se corta, se puede volver a importar: son idempotentes. La app actual sigue
funcionando con estas tablas nuevas.

---

## Paso 3 · Primer administrador (una sola vez)

En tu equipo, desde `src/backend`:

```
npm run usuario:crear -- --nombres "Tu nombre" --apellidos "Tus apellidos" --usuario tu.usuario --correo tu@correo.co --documento 123456 --tipo CC --institucion 1 --password "REEMPLAZAR_CON_UNA_CLAVE_SEGURA" --rol ADMINISTRADOR
```

`REEMPLAZAR_CON_UNA_CLAVE_SEGURA` es solo un marcador de ejemplo: sustitúyelo por una clave única y segura.
No uses una contraseña real en documentos, comandos guardados ni capturas compartidas.
Copia el `INSERT` que imprime y ejecútalo en la pestaña SQL de phpMyAdmin. Desde ese momento
creas docentes y otros administradores desde `admin.html`, sin SQL.

---

## Paso 4 · Código

1. Administrador de archivos → entrar a **`httpdocs/`** (no a `src/`) → **Subir** el zip.
2. Clic derecho en el zip → **Extraer archivos** → marcar **Reemplazar archivos existentes**.
   El zip trae las rutas `src/backend/...`, `src/frontend/...`, `MCP/...` y `AGENTE/...`, así que
   cada archivo cae en su lugar. MCP y Guardián se cargan desde el backend principal; no se
   configura una segunda aplicación Node.js ni otro puerto.
3. Borrar el zip de `httpdocs/`.
4. *(Opcional)* Borrar tres archivos viejos que ya no se usan (no hacen daño si quedan):
   - `src/frontend/js/docente.js`
   - `src/backend/core/monitoring.py`
   - `src/backend/tests/monitoring-history.test.js`

El zip **no trae** `.env`, `uploads/`, `node_modules/`, `tmp/`, `.plesk.startup.cjs`,
`esp32-firmware/`, migraciones ni pruebas, así que no los pisa.

---

## Paso 5 · Instalar dependencias y reiniciar

1. Plesk → **Node.js** → **NPM install** para instalar las dependencias de `httpdocs/src/backend/package.json`.
2. Plesk → **Node.js** → **Restart App**. No cambies la raíz de la aplicación ni el archivo de arranque.

El backend sirve `/mcp` y `/api/guardian` desde el mismo proceso. Al reiniciar, comprueba la
conexión a la base y después inicializa Guardián; si una dependencia no está disponible, vuelve
a intentarlo cada 30 segundos.

---

## Paso 6 · Verificar en producción

Abrir el navegador con **Ctrl+F5**:

| Revisar | Esperado |
|---|---|
| `https://rural40.ml-ware.com/api/health` | `{"status":"ok","service":"rural40","mcp":"ready","guardian":"ready"}` |
| `https://rural40.ml-ware.com/api/health/db` | `{"status":"ok","database":"connected"}` |
| `https://rural40.ml-ware.com/api/config` | `{}` |
| Entrar con el administrador del paso 3 | Abre `admin.html` con el resumen |
| Admin → Usuarios → crear un docente de prueba | Llega el correo de invitación (revisa spam); su enlace abre "Activa tu cuenta" |
| Entrar como estudiante | Dashboard, menú *Cuestionarios* y *Fotos de avance* con timelapse |
| Estudiante → *Asistente IA* | Se ve el historial del proyecto; se puede iniciar una conversación y enviar una pregunta. La mascota se oculta en esta vista. |
| Estudiante → abrir y continuar una conversación | Se cargan sus mensajes anteriores y Guardián responde usando los datos permitidos del proyecto. |
| Guardar una bitácora con un emoji 🌱 | Se guarda sin error |
| Entrar como docente | Semáforo con datos reales, ficha de un proyecto, *Cuestionarios* con el banco de 30 preguntas |
| **ESP32 de sensores real**, encendido 10 min | En phpMyAdmin: `SELECT * FROM tblh_registros_monitoreo ORDER BY id DESC LIMIT 3;` con lecturas nuevas |

Si MCP o Guardián no aparecen como `ready`, revisa el **log de la aplicación** en Plesk y confirma
la conexión a MariaDB, los permisos del usuario de base de datos, las tablas de conversaciones y
las variables `OPENAI_API_KEY` y `MODELO`. La causa más probable de que la app no arranque sigue
siendo una configuración incompleta de `SESSION_SECRET` o de las variables de base de datos.
Enviar una pregunta de prueba a Guardián puede consumir créditos de la cuenta de OpenAI.

---

## Paso 7 · (Después) imagen de la ESP32-CAMERA para producción

Mientras no se publique, el dashboard muestra "La imagen de instalación de la cámara aún no está
publicada" y todo lo demás funciona. Para publicarla:

1. `firmware/esp32-camara/include/config.h` ya está con los valores de producción
   (`https://rural40.ml-ware.com`, foto cada 2 h, versión 1.0.4). Solo falta la clave:
   en Plesk abre `httpdocs/src/backend/.env`, copia el valor de `DEVICE_PROVISIONING_KEY`
   y pégalo en lugar de `PEGA_AQUI_LA_CLAVE_DE_PLESK`.
2. Desde `firmware/esp32-camara`: `powershell -ExecutionPolicy Bypass -File publicar-imagen.ps1` (**sin** `-PermitirLocal`).
   Debe decir `Servidor en la imagen : https://rural40.ml-ware.com`.
3. En Plesk, Administrador de archivos → `httpdocs/src/backend/esp32-firmware/` → crear la
   carpeta `camara` y dentro `first-install` → subir los 6 archivos de
   `src/backend/esp32-firmware/camara/first-install/` (`first-flash.bin`, `bootloader.bin`,
   `partitions.bin`, `boot_app0.bin`, `application.bin`, `manifest.json`). No hace falta Restart App.
4. Comprobar: `https://rural40.ml-ware.com/api/firmware/first-install/manifest?tipo=camara`
   responde con `"version": "1.0.4"`, y en el dashboard "Dispositivo nuevo" → ESP32-CAMERA ofrece la descarga.
5. Para volver a probar en tu PC: copia `include/config.local.h` sobre `config.h` y publica con `-PermitirLocal`.

⚠️ No subas la imagen compilada para pruebas locales: apunta a la IP de tu PC. Tampoco
subas `config.h` a ningún lado: lleva la clave de aprovisionamiento.

---

## Si algo sale mal: volver atrás

1. Subir y extraer en `httpdocs/` el zip de respaldo del paso 1, reemplazando archivos.
2. Restart App.

La base de datos **no necesita restaurarse**: la versión original funciona con las tablas nuevas
(se comprobó en la regresión).

---

## Para próximas actualizaciones

1. Probar en local: `node local/pruebas/todas.mjs`; ejecutar `npm test` desde `src/backend/`, `MCP/` y `AGENTE/`.
2. `scripts/empaquetar-despliegue.ps1`.
3. Repetir los pasos 1, 4, 5 y 6. El paso 2 solo aplica si hay una migración nueva. Ejecutar
   **NPM install** después de cada despliegue que cambie dependencias.
