# Rural 4.0 — Mapa de cambios frente a la versión en Plesk

Comparación entre la versión original, que es la que corre hoy en Plesk (commit `b1b04fb`, tomada
de producción), y la versión lista para desplegar (commit `9bc0f8d` o posterior). Son 14 commits:
90 archivos nuevos, 14 modificados y 3 eliminados. Este documento **no se sube a Plesk**.

---

## 1. Resumen

| Área | Antes | Ahora |
|---|---|---|
| Seguridad | La API confiaba en el `id_usuario` que mandaba el navegador; la clave de registro de dispositivos era pública | La identidad sale de la sesión firmada y se valida en cada petición; hay reglas de acceso por rol en un solo lugar |
| Arquitectura | Rutas con SQL y reglas mezcladas (5 archivos) | Capas: rutas → servicios → repositorios, más middlewares y políticas |
| Estudiante | Proyecto, planta, misiones, registros, fotos | + Cuestionarios, Guardián (mascota), timelapse de la cámara, selector sensor/cámara al instalar |
| Docente | Maqueta con datos inventados | Semáforo real, ficha del proyecto, gestión, cuestionarios con resultados, timelapse, CSV |
| Administrador | Sin página propia | `admin.html`: usuarios (con invitación por correo), instituciones, plantas, dispositivos, auditoría |
| ESP32-CAMERA | Sketch viejo, sin integración | Firmware nuevo con el mismo proceso del sensor, imagen de instalación desde el dashboard, OTA separado por modelo |
| Base de datos | 13 tablas en utf8mb3 | 22 tablas en utf8mb4, con 3 migraciones que se importan a mano |
| API | 40 rutas | 87 rutas (84 en 8 routers + 3 del sistema) |
| Pruebas | 1 test | 45 tests unitarios + 107 comprobaciones de extremo a extremo + regresión contra la versión original |

---

## 2. Seguridad: huecos cerrados

| # | Problema en la versión original | Corrección |
|---|---|---|
| 1 | **Suplantación por ID**: cualquiera podía leer o modificar proyectos, bitácoras y fotos de otro usuario cambiando `id_usuario` / `usuario_id` en la URL | Todas las rutas usan el usuario de la sesión; ese parámetro ahora se ignora |
| 2 | `GET /api/config` entregaba `DEVICE_REGISTRATION_KEY` a cualquiera, y con ella se podían listar, vincular y reprovisionar dispositivos ajenos | Ya no la entrega (responde `{}`); el dashboard usa la sesión |
| 3 | `DELETE /api/dispositivos/proyectos/:id` no tenía ninguna protección | Exige sesión y permiso de gestión sobre el proyecto |
| 4 | `GET /api/proyectos/resumen/:id` mostraba cualquier proyecto, incluida la MAC del dispositivo | Solo lo ve el estudiante dueño, su docente o el administrador |
| 5 | XSS: el texto de proyectos y bitácoras se pintaba con `innerHTML` sin escapar | Todo texto de usuarios pasa por `escapeHtml` |
| 6 | Secreto de sesión con valor por defecto si faltaba en el `.env` | La app no arranca sin `SESSION_SECRET` |
| 7 | Una cuenta desactivada seguía funcionando mientras su cookie estuviera vigente | Cada petición confirma en la BD que el usuario siga activo |
| 8 | Nombres sin escapar en el HTML de los correos | Escapados |
| 9 | Un dispositivo desactivado volvía a quedar activo con solo reprovisionarse | Responde 403 hasta que el administrador lo reactive |
| 10 | Rutas `/api` inexistentes y fotos faltantes en `/uploads` devolvían la página de inicio con 200 | Responden 404 |

---

## 3. Arquitectura del backend

```
middlewares/  auth.js (requireSession, requireRole) · device-auth.js (X-Device-Key) · error-handler.js
routes/       HTTP únicamente: auth, projects, monitoring, devices, firmware, docente, cuestionarios, admin
services/     reglas: proyectos, bitacoras, fotografias, lecturas, dispositivos, docente, semaforo,
              cuestionarios, admin, correo, firmware, auditoria
repositories/ SQL: usuarios, catalogos, proyectos, bitacoras, fotografias, lecturas, dispositivos,
              cuestionarios, admin, auditoria, transaccion
policies/     proyectos.policy.js — canView · canManage · canSupervise · canRecord
config/       catalogos.js — valores permitidos y umbrales del semáforo
lib/          errores HTTP, handler, fechas en hora de Colombia, CSV para Excel, escape HTML
```

**Reglas de acceso a un proyecto:**
- **Estudiante dueño:** ve, gestiona y registra (bitácoras y fotos), salvo si el proyecto está finalizado.
- **Docente asignado:** ve, gestiona y supervisa (finalizar, reabrir, reasignar, ocultar fotos), pero no registra por el estudiante.
- **Administrador:** ve y supervisa todo.
- **Quien no puede ver el proyecto recibe 404**, así no se revela que existe.

---

## 4. Funcionalidades nuevas

### Estudiante (`estudiante.html`)
- **Cuestionarios:**
  - lista con estado;
  - un solo intento, con el puntaje al enviar;
  - respuestas correctas y explicación visibles cuando el cuestionario cierra.
- **Guardián:**
  - mascota animada en SVG con 6 expresiones;
  - mensajes según la humedad y temperatura, el sensor desconectado, las misiones del día, los cuestionarios pendientes y la hora;
  - botones de acceso directo, minimizable y respetuosa de "reducir movimiento".
- **Fotos de avance:**
  - **timelapse** de la ESP32-CAMERA (24 h, 7 días, 30 días o todo), con reproducción y velocidad;
  - "Mis fotos" separado de las fotos automáticas.
- **Dispositivo nuevo:** antes de dar los pasos pregunta **si es ESP32 de sensores o ESP32-CAMERA**, y muestra la imagen y las instrucciones de cada uno.
- **Vincular dispositivo:** la lista de pendientes muestra solo el tipo elegido.
- **Proyecto finalizado:** queda en modo consulta.

### Docente (`docente.html`, reemplaza la maqueta)
- **Semáforo** por proyecto:
  - 🔴 3 o más días sin bitácora, o planta en riesgo;
  - 🟠 sensor o cámara sin conexión, o lecturas en 0;
  - 🟡 sin sensor, o retos incompletos;
  - 🟢 al día.
- **Indicadores reales:** estudiantes activos, proyectos en curso, bitácoras al día, sensores en línea y alertas.
- **Ficha del proyecto:**
  - alertas y dispositivos;
  - gráficas con los días de bitácora marcados;
  - timelapse, con opción de ocultar cuadros;
  - comparador de fotos antes/después;
  - línea de tiempo por día;
  - dominio del estudiante por tema en los cuestionarios.
- **Gestión:**
  - editar, configurar el LED, vincular y desvincular dispositivos;
  - finalizar y reabrir (finalizar no desvincula los dispositivos);
  - reasignar a otro docente de la institución, archivar.
- **Cuestionarios:**
  - banco de 30 preguntas en 6 temas, más preguntas propias;
  - borrador, publicación y fechas de apertura y cierre;
  - resultados por pregunta (distribución de respuestas) y por estudiante;
  - exportación a CSV.
- **Exportar el seguimiento del curso a CSV** (UTF-8 con BOM, separador `;`).

### Administrador (`admin.html`)
- **Resumen general:** usuarios por rol, proyectos, bitácoras, fotos, cuestionarios, dispositivos en línea y firmware OTA publicado (sensor y cámara).
- **Usuarios:**
  - crea **docentes y administradores con invitación por correo** (enlace de 72 h para que la persona cree su contraseña; si el correo falla, se muestra el enlace para compartirlo);
  - editar, cambiar rol, activar o desactivar, reenviar el acceso.
  - Reglas: nadie se desactiva ni se cambia el rol a sí mismo; siempre queda al menos un administrador activo; no se cambia el rol de quien tiene proyectos activos en su rol actual.
- **Instituciones y plantas:** crear, editar, activar o desactivar.
- **Dispositivos:**
  - todos los ESP32 y cámaras, con conexión, lecturas o fotos de las últimas 24 h y proyecto;
  - liberar un dispositivo de su proyecto, activar o desactivar su API key.
- **Auditoría:** quién hizo qué y cuándo, con filtros y paginación.
- **El login del administrador lleva a `admin.html`**, y desde ahí tiene acceso al panel docente.

### ESP32-CAMERA
- **Firmware nuevo** en `firmware/esp32-camara/` (PlatformIO, AI-Thinker ESP32-CAM), con **la misma metodología del sensor**:
  - WiFiManager (red `Rural40-Camera-Setup`) y `Preferences` en `rural40`;
  - provisión automática y consulta de `/configuracion`;
  - cola en microSD si no hay conexión.
- **Compatible con sensores sin JPEG** (el tuyo es un **GC2145**): captura en RGB565 y convierte a JPEG en la placa.
- **Subida por partes**, tolerante a redes débiles, con diagnóstico de la señal Wi-Fi.
- **Intervalo de fotos:** 60 s en pruebas; se configura en `config.h`.
- **`publicar-imagen.ps1`:** compila y publica `first-flash.bin` y sus componentes con los mismos nombres y direcciones que la imagen del sensor.
- **Servidor con firmware separado por modelo:** una cámara nunca recibe el OTA del sensor; la primera instalación se pide con `?tipo=camara`.
- **Probada con la placa real:** provisión, vinculación y fotos recibidas en el servidor local.

---

## 5. Correcciones de errores

| Error en la versión original | Corrección |
|---|---|
| Tablas en `utf8mb3`: un emoji en una observación daba error 500 | Migración 001 a `utf8mb4` |
| La cámara aparecía siempre "sin conexión" (las fotos no actualizaban el último contacto) | Cada foto actualiza `fecha_ultimo_contacto` |
| Fotos de la cámara guardadas en UTC (5 horas corridas) | Hora de Colombia |
| Una cámara ya vinculada recibía un código de vinculación nuevo al reiniciarse | Un dispositivo vinculado conserva su estado |
| Archivos temporales de fotos huérfanos cuando la subida fallaba | Siempre se borran |
| Lecturas en 0 de sensores desconectados se graficaban como 0 °C | Se muestran como "sin dato" (la BD conserva el valor) |
| La foto automática de la cámara completaba el reto "foto" del estudiante | Solo cuenta la foto que sube el estudiante |
| El historial de lecturas ordenaba sin índice | Índice `(id_proyecto, estado, fecha_registro)` |

---

## 6. Base de datos: migraciones (se importan a mano en phpMyAdmin)

| Archivo | Qué hace | ¿Obligatoria? |
|---|---|---|
| `001_base.sql` | `tbl_migraciones`, conversión a utf8mb4, índice del historial, elimina un índice duplicado | Sí |
| `002_auditoria.sql` | Tabla `tblh_auditoria` | Recomendada (sin ella la app funciona, pero no audita) |
| `003_cuestionarios.sql` | 7 tablas de cuestionarios y banco inicial de 30 preguntas | Sí (sin ella fallan las pantallas de cuestionarios) |

Las tres:
- son idempotentes (se pueden importar más de una vez);
- solo agregan o convierten, no borran datos;
- **no afectan a la versión original**: se probó con la base ya migrada.

---

## 7. Compatibilidad

**No cambió** (comprobado en la regresión, ver sección 9):
- **Las URL, los headers y las respuestas que usa el firmware del ESP32 de sensores:** provisión, configuración, lecturas, vinculación, LED, OTA (mismo binario) y primera instalación. **Los sensores instalados siguen funcionando sin tocarlos.**
- **Login y cookie:** mismo nombre y atributos, así que las sesiones abiertas siguen siendo válidas tras desplegar.
- **Páginas públicas** (inicio, registro, recuperación) con el mismo contenido.

**Cambios de comportamiento visibles:**
- Sin sesión, las rutas de datos responden 401 (antes entregaban datos).
- `/api/config` responde `{}`.
- Un navegador con la página vieja en caché necesita recargar para buscar dispositivos pendientes.

---

## 8. Inventario de archivos

| Carpeta | Contenido | ¿Va a Plesk? |
|---|---|---|
| `src/backend/{server,db,session}.js`, `package*.json` | Arranque, pool, sesión | ✅ zip |
| `src/backend/{config,lib,middlewares,policies,services,repositories,routes,scripts}/` | Toda la lógica | ✅ zip |
| `src/frontend/` | Páginas, CSS y JS (`lib/`, `estudiante/`, `docente/`, `admin/`) | ✅ zip |
| `src/backend/migraciones/` | 001, 002 y 003 | ⚠️ se importan en phpMyAdmin, no se suben |
| `src/backend/esp32-firmware/camara/first-install/` | Imagen de la cámara | ⚠️ se sube a mano, y **solo la versión compilada para producción** |
| `src/backend/{.env, uploads/, tmp/, node_modules/, .plesk.startup.cjs}` | Entorno de Plesk | ❌ no se tocan |
| `src/backend/tests/`, `.env.local` | Pruebas y configuración local | ❌ |
| `firmware/esp32-camara/` | Código fuente del firmware de la cámara | ❌ |
| `local/` | Docker, simulador, pruebas de extremo a extremo | ❌ |
| `scripts/empaquetar-despliegue.ps1` | Arma el zip | ❌ |
| `CAMBIOS.md`, `MAPA-SISTEMA.md`, `PLAN-MIGRACION.md` | Documentación | ❌ |

**Eliminados:** `src/backend/core/monitoring.py` (código sin uso), `src/frontend/js/docente.js` (maqueta) y `src/backend/tests/monitoring-history.test.js` (reemplazado).

---

## 9. Pruebas ejecutadas (28-sep-2026, base local con el volcado de producción)

| Prueba | Resultado |
|---|---|
| Tests unitarios (`npm test`) | ✅ 45/45 |
| Extremo a extremo · plataforma (`local/pruebas/plataforma.mjs`) | ✅ 30/30 |
| Extremo a extremo · cuestionarios | ✅ 23/23 |
| Extremo a extremo · administración | ✅ 29/29 |
| Extremo a extremo · cámara y timelapse | ✅ 25/25 |
| Regresión contra la versión original (`local/pruebas/regresion.mjs`, 66 peticiones iguales a ambas versiones) | ✅ 55 iguales · 2 iguales con campos nuevos · 4 cambios de seguridad esperados · 5 diferencias explicadas¹ |
| Pantallas (21 vistas: públicas, estudiante, docente, administrador) | ✅ sin errores de consola |
| Migraciones sobre el volcado real (dos veces seguidas) | ✅ sin errores ni duplicados |
| ESP32-CAM real (placa AI-Thinker con sensor GC2145) | ✅ instalación desde el dashboard, provisión, vinculación y fotos recibidas |

¹ Las 5 diferencias:
- `/api/config` sin la clave (intencional);
- la cámara ahora informa su último contacto (corrección);
- borrar una bitácora ya borrada da 404;
- `styles.css` y `favicon.svg` tienen el mismo contenido y solo cambian los fines de línea.

Para repetir todo en local: `node local/pruebas/todas.mjs` (la regresión requiere levantar la versión original; ver `local/README.md`).

---

## 10. Pendientes y riesgos conocidos

| Tema | Estado |
|---|---|
| Imagen de la cámara para **producción** | Falta compilarla con `https://rural40.ml-ware.com`, la clave de provisión real y el intervalo de fotos definitivo |
| Intervalo de fotos de la cámara | 60 s es solo para pruebas (~85 MB por día y por cámara); falta definir el definitivo (recomendado: 2 h) |
| OTA de la cámara | Desactivado: `huge_app.csv` no tiene partición OTA |
| Código de vinculación visible en "Pendientes" | Riesgo residual (ventana de 24 h); se cierra cuando el firmware muestre el código en el equipo |
| Código interno derivado de los últimos 3 bytes de la MAC (sensor) | Preexistente: dos placas con la misma terminación chocan si el firmware no envía `codigo_interno` (la cámara sí lo envía) |
| Límite de intentos en login/registro · TLS sin validar en el SMTP · rotar secretos del `.env` | Pendientes de seguridad menores |
| Raíz del documento y estáticos de nginx en Plesk | Verificar que no se salten las protecciones de Express |
| Experimentos y Asistente IA (vista del estudiante) | Pantallas vacías, sin funcionalidad |
