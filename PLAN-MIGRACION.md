# Plan de migración — Rural 4.0

Arquitectura por capas, cierre de huecos de seguridad y módulo docente.

> Este archivo es de trabajo: **no se sube a Plesk** (queda excluido del paquete de despliegue).

---

## Estado de ejecución (27-sep-2026)

Fases 0 a 7 implementadas en local y probadas; **pendiente de desplegar en Plesk**.

| Fase | Estado |
|---|---|
| 0 Preparación | ✅ git iniciado, `npm test`, código muerto eliminado. ⏳ Mover `rural40_db.sql` fuera del proyecto (lo hace Daniel) |
| 1–4 Backend en capas + seguridad | ✅ 31 tests pasando |
| 5 Frontend compartido | ✅ `js/lib/` (api, html, sesion, charts); `dashboard.js` como módulo |
| 6 Módulo docente | ✅ panel con semáforo, ficha, gestión, CSV, `npm run docente:crear` |
| 7 Migraciones | ✅ `001_base.sql`, `002_auditoria.sql` listas para importar |
| Cuestionarios por tema | ✅ migración `003_cuestionarios.sql` (30 preguntas en 6 temas), vista del estudiante, editor/banco y resultados del docente, dominio por tema en la ficha |
| Guardián (mascota del estudiante) | ✅ SVG animado con 6 expresiones y mensajes según sensores, misiones, cuestionarios y hora del día. Solo frontend (`js/estudiante/guardian*.js`, `css/guardian.css`), sin cambios en BD |
| Módulo de administración | ✅ `admin.html`: resumen, usuarios (crear docentes/administradores con invitación por correo, editar, rol, activar/desactivar, reenviar acceso), instituciones, plantas, dispositivos (desvincular, activar/desactivar) y auditoría. Sin migración nueva. El primer administrador se crea con `npm run usuario:crear -- … --rol ADMINISTRADOR` |
| Entorno local | ✅ `local/` (Docker MariaDB 11.4 + `npm run dev` + simulador de ESP32) |
| Despliegue | ⏳ `scripts/empaquetar-despliegue.ps1` + procedimiento de la sección 5 |
| Prueba con ESP32 físico | ⏳ Obligatoria antes de dar por cerrada la entrega |

Diferencias con el plan original:
- La lógica de `auth.routes.js` (login, registro, recuperación) se dejó en su archivo; solo se agregó `/api/auth/me`, el escape de nombres en correos y el uso de `catalogos.repo`.
- Las fotos ocultas no se listan, pero su URL en `/uploads` sigue siendo accesible si alguien la conoce (nombres aleatorios, no enumerables).

---

## 1. Contexto y restricciones

- **Hosting:** Plesk, dominio `rural40.ml-ware.com`, código en `httpdocs/src`. La app Node vive en `src/backend` y la ejecuta Phusion Passenger a través de `.plesk.startup.cjs`.
- **Base de datos:** MariaDB 11.4 en Plesk (`rural40_db`). Los cambios de esquema **se importan a mano** en phpMyAdmin. Nunca se aplican desde el código.
- **Forma de despliegue:** los cambios se hacen y prueban en local, y luego se suben `src/backend` (solo código) y `src/frontend` a Plesk.
- **Stack que se conserva:** Node 24, Express 5, mysql2, HTML/CSS/JS sin paso de compilación. No se introduce ORM, TypeScript, frameworks de frontend ni microservicios.

### Elementos del entorno que no se tocan

| Ruta | Motivo |
|---|---|
| `src/backend/.plesk.startup.cjs` | Arranque de Passenger, lo genera Plesk |
| `tmp/restart.txt` (los tres) | Reinicio de Passenger; el que sirve es `src/backend/tmp/restart.txt` |
| `.node-version` | Versión de Node del panel |
| `src/backend/.env` | Se mantienen nombres y estructura; las variables nuevas se agregan a mano en Plesk |
| `src/backend/uploads/` | Fotos de producción |
| `src/backend/node_modules/` | Se instala con **NPM install** desde el panel |
| `src/backend/esp32-firmware/` | Binarios y manifiestos que consumen los ESP32 |
| URLs y headers que usa el firmware | `POST /api/dispositivos/provisionar`, `GET /api/dispositivos/configuracion`, `POST /api/monitoreo/lecturas`, `POST /api/monitoreo/fotografias`, `/api/firmware/*`, con los headers `X-Device-Key` y `X-Provisioning-Key` |

---

## 2. Decisiones tomadas

1. **Arquitectura en 3 capas livianas:** `routes → services → repositories`, más `middlewares` y `policies`. Sin hexagonal ni clean architecture completa.
2. **La identidad sale de la sesión**, la cookie `rural40_session`, y nunca de `id_usuario` / `usuario_id` enviados por el cliente.
3. **Los proyectos los registra el estudiante.** El docente no crea proyectos.
4. **El docente gestiona la estructura del proyecto; el estudiante es dueño de lo que registra.** El docente comenta, pero no edita bitácoras.
5. **El estudiante solo puede elegir docentes de su institución.**
6. **Borrado siempre lógico** (`estado = 0`).
7. **Migración incremental por router.** Las URLs no cambian y cada fase queda desplegable por sí sola.

---

## 3. Arquitectura objetivo

```
Petición HTTP
   │
middlewares/   requireSession · requireRole · requireDevice   → quién eres
   │
routes/        HTTP: params/body, validación de formato, respuesta    (sin SQL)
   │
services/      reglas de negocio + políticas de acceso                (sin req/res)
   │
repositories/  SQL parametrizado y transacciones                      (sin reglas)
   │
MariaDB (Plesk)
```

### Estructura del backend

```
src/backend/
├── .plesk.startup.cjs · tmp/ · .env · .node-version · esp32-firmware/ · uploads/   ← intactos
├── server.js                  monta middlewares, routers y error-handler
├── db.js · session.js         se quedan en su sitio (db.js lo usan los tests)
├── config/
│   └── catalogos.js           colores/brillo LED, tipos de tierra, rangos válidos, umbrales del semáforo
├── lib/
│   ├── errors.js              HttpError, NotFoundError(404), ForbiddenError(403), ConflictError(409), ValidationError(400)
│   └── fechas.js              conversión a DATETIME en hora de Colombia
├── middlewares/
│   ├── auth.js                requireSession, requireRole(...roles)
│   ├── device-auth.js         requireDevice (reemplaza las 3 copias de getDevice)
│   └── error-handler.js       convierte errores en JSON; 404 JSON para /api desconocidas
├── policies/
│   └── proyectos.policy.js    canView · canManage · canRecord
├── services/
│   ├── auth.service.js
│   ├── proyectos.service.js
│   ├── bitacoras.service.js
│   ├── fotografias.service.js
│   ├── lecturas.service.js
│   ├── dispositivos.service.js
│   └── docente.service.js     indicadores, semáforo, exportación
├── repositories/
│   ├── usuarios.repo.js · proyectos.repo.js · bitacoras.repo.js
│   ├── fotografias.repo.js · lecturas.repo.js · dispositivos.repo.js
│   └── catalogos.repo.js      plantas, instituciones, tipos de documento, docentes
├── routes/                    mismos archivos y URLs + docente.routes.js
├── scripts/
│   ├── update-firmware-manifest.js   (existente)
│   └── crear-docente.js              NUEVO: genera el INSERT con hash bcrypt para importar en Plesk
├── migraciones/               .sql para importar a mano (no se despliegan)
└── tests/                     node --test, simulando la BD como el test actual
```

### Políticas de acceso (`policies/proyectos.policy.js`)

| Función | ESTUDIANTE | DOCENTE | ADMINISTRADOR |
|---|---|---|---|
| `canView(user, p)` | `p.id_usuario === user.id` | `p.id_docente === user.id` | siempre |
| `canManage(user, p)` | dueño y proyecto no finalizado | docente asignado | siempre |
| `canRecord(user, p)` (bitácoras y fotos) | dueño y proyecto no finalizado | **nunca** | nunca |

Un proyecto está **finalizado** cuando `fecha_fin IS NOT NULL` y `estado = 1`. Está **archivado** cuando `estado = 0`.

### Matriz de permisos del producto

| Acción | Estudiante | Docente |
|---|:-:|:-:|
| Crear proyecto | ✅ | ❌ |
| Editar nombre y descripción | ✅ | ✅ |
| Cambiar planta o tierra (solo sin dispositivos vinculados) | ✅ | ✅ |
| Configurar LED | ✅ | ✅ |
| Vincular / desvincular dispositivos | ✅ | ✅ |
| Finalizar / reabrir | ❌ | ✅ |
| Reasignar a otro docente de la institución | ❌ | ✅ |
| Archivar | ✅ | ✅ |
| Crear, editar o borrar bitácoras | ✅ | ❌ |
| Subir fotos | ✅ | ❌ |
| Ocultar foto | ❌ | ✅ |
| Ver bitácoras, fotos y lecturas | ✅ (propias) | ✅ (asignados) |

### Frontend (ES modules nativos, sin compilación)

```
src/frontend/js/
├── lib/
│   ├── api.js        fetch con JSON, manejo de errores y 401 → redirige a /
│   ├── html.js       escapeHtml() — obligatorio para todo texto que venga de usuarios
│   ├── sesion.js     GET /api/auth/me (reemplaza la identidad en localStorage)
│   └── charts.js     gráficas compartidas entre estudiante y docente
├── estudiante/       dashboard.js se divide aquí de forma gradual
└── docente/
    ├── main.js
    ├── panel.js           semáforo + indicadores
    ├── proyecto.js        ficha: línea de tiempo, comparador de fotos, gráficas
    └── gestion.js         acciones de gestión
```

---

## 4. Fases

Cada fase indica si requiere cambios en la BD, sus criterios de aceptación y su riesgo.
Tamaño relativo: S (pequeña), M (media), L (grande).

### Fase 0 — Preparación · S · sin BD

- [ ] Confirmar que la copia local es igual a la del servidor. Si no hay certeza, volver a descargar `httpdocs/src`.
- [ ] Iniciar git en la carpeta local, con un `.gitignore` que excluya `.env`, `uploads/`, `node_modules/`, `tmp/`, `*.log` y `rural40_db.sql`.
- [ ] Agregar el script `"test": "node --test tests/"` a `package.json`.
- [ ] Mover `rural40_db.sql` fuera de la carpeta del proyecto, porque contiene datos personales. Pedir un export de solo estructura.
- [ ] Eliminar el código muerto: `core/monitoring.py` y la variable `PYTHON_PATH`. Se borra del `.env` solo si el usuario lo confirma.

**Aceptación:** `npm test` pasa y el primer commit refleja el estado de producción.

### Fase 1 — Base transversal · M · sin BD

- [ ] `lib/errors.js` + `middlewares/error-handler.js`.
- [ ] Respuesta 404 en JSON para rutas `/api/*` inexistentes. Hoy devuelven `index.html` con código 200.
- [ ] `middlewares/auth.js`: `requireSession` (usa `readSession` y llena `req.user = { id, rol }`) y `requireRole`.
- [ ] `requireSession` revisa en BD que el usuario siga activo (`estado = 1`), para que una cuenta desactivada pierda el acceso de inmediato.
- [ ] `middlewares/device-auth.js`: `requireDevice`, con el mismo comportamiento que las 3 copias actuales.
- [ ] `config/catalogos.js`: listas de LED y tierra, rango de temperatura 0–50 y umbrales del semáforo.
- [ ] `GET /api/auth/me`.
- [ ] `session.js`: si falta `SESSION_SECRET`, registrar el error en el log y no arrancar. El `.env` actual ya lo tiene.

**Aceptación:** la app funciona igual que antes y `GET /api/auth/me` devuelve el usuario de la cookie.
**Riesgo:** bajo, porque solo se agrega código.

### Fase 2 — Proyectos en capas · M · sin BD

- [ ] `proyectos.repo.js`, `catalogos.repo.js`, `proyectos.service.js` y `proyectos.policy.js`.
- [ ] Migrar `projects.routes.js`, manteniendo las URLs:
  - `GET /api/proyectos` → lista los proyectos de `req.user`. Se ignora `usuario_id`.
  - `POST /api/proyectos` → `id_usuario = req.user.id`. Solo el rol `ESTUDIANTE`.
  - `PUT /api/proyectos/:id` y `DELETE /api/proyectos/:id` → `canManage`.
  - `GET /api/proyectos/resumen/:id` y `/resumen/:id/lecturas` → `canView`. **Cierra la fuga actual de `/resumen/:id`.**
  - `GET /api/proyectos/docentes` → solo docentes de la institución del usuario.
- [ ] Soporte de "finalizado" en las consultas: se muestra con su estado y no admite registros nuevos.
- [ ] Frontend: quitar `usuario_id` e `id_usuario` de las llamadas de proyectos en `dashboard.js`.
- [ ] Tests de permisos: el estudiante A no ve ni edita lo de B, y el docente solo ve lo suyo.

**Aceptación:** con `usuario_id` falso en la URL no se obtiene nada ajeno.
**Riesgo:** medio.

### Fase 3 — Monitoreo en capas · M · sin BD

- [ ] `bitacoras.*`, `fotografias.*` y `lecturas.*` (repo y service).
- [ ] Bitácoras (GET/POST/PUT/DELETE): `canView` para leer y `canRecord` para escribir. Se ignora `id_usuario`.
- [ ] Fotos:
  - Por sesión (web): `canRecord`.
  - Por `X-Device-Key` (cámara): igual que hoy.
  - `GET` con `canView`, que excluye las fotos ocultas (`estado = 0`).
- [ ] Corregir la fuga de archivos temporales de multer cuando la petición termina en 400, 401 o 404.
- [ ] Fotos de la cámara: actualizar `fecha_ultimo_contacto` y usar la hora de Colombia en `fecha_fotografia` (`lib/fechas.js`).
- [ ] Proyecto finalizado: el estudiante no puede crear bitácoras ni subir fotos desde la web. Las lecturas y fotos del dispositivo se siguen aceptando (D2).
- [ ] `lecturas`: marcar como "sensor desconectado" la lectura con todos los valores en 0, sin descartarla, para que el semáforo y las gráficas la distingan.
- [ ] Frontend: quitar `id_usuario`; aplicar `escapeHtml` en bitácoras, proyectos y álbum de fotos.

**Aceptación:**
- Un estudiante no puede leer ni escribir la bitácora de otro.
- Una observación con `<script>` se muestra como texto.
- El ESP32 y la cámara siguen enviando datos (HTTP 201).

**Riesgo:** medio.

### Fase 4 — Dispositivos y firmware · M · sin BD

- [ ] `dispositivos.repo.js` + `dispositivos.service.js`.
- [ ] **Quitar `registrationKey` de `GET /api/config`.**
- [ ] Endpoints del dashboard, protegidos con sesión y `canManage` del proyecto:
  - `GET /pendientes`
  - `POST /registrar`
  - `POST /proyectos/:id/vincular`
  - `POST /proyectos/:id/configuracion`
  - `GET /proyectos/:id/estado`
  - `DELETE /proyectos/:id` ← hoy no tiene ninguna protección
- [ ] `X-Registration-Key` sigue siendo válido como alternativa, para herramientas internas, pero ya no se expone al navegador.
- [ ] `GET /pendientes` exige sesión y solo lista dispositivos provisionados en las últimas 24 h. Sigue devolviendo `codigo_vinculacion`, porque el flujo actual del dashboard depende de eso. **Riesgo residual:** cualquier usuario con sesión puede vincular un dispositivo recién provisionado. Se cierra del todo cuando el firmware muestre el código en el propio equipo (pendiente de firmware).
- [ ] `/provisionar`: si el dispositivo ya está vinculado a un proyecto activo, no regenerar el `codigo_vinculacion`.
- [ ] Sin cambios en las URLs ni en los headers del firmware.
- [ ] Frontend: quitar el campo oculto `device-registration-key` y el uso de `/api/config`.

**Aceptación:**
- La vinculación funciona desde el dashboard sin clave en el navegador.
- Un ESP32 real reiniciado se reprovisiona y sigue enviando lecturas.

**Riesgo:** medio-alto. **Probar con un ESP32 físico antes de desplegar.**

### Fase 5 — Frontend compartido · M · sin BD

Puede avanzar en paralelo con las fases 2 a 4.

- [ ] `lib/api.js`, `lib/html.js`, `lib/sesion.js` y `lib/charts.js`.
- [ ] `estudiante.html` y `docente.html` cargan `<script type="module">`.
- [ ] Extraer de `dashboard.js` las gráficas y el acceso a la API. El resto se divide de forma gradual, sin reescribir pantallas.

**Aceptación:** el dashboard del estudiante se ve y funciona igual.

### Fase 6 — Módulo docente (MVP) · L · sin BD (auditoría opcional: M002)

#### 6.1 Backend (`routes/docente.routes.js`, protegido con `requireSession` + `requireRole('DOCENTE','ADMINISTRADOR')`)

Los recursos de un proyecto (resumen, lecturas, bitácoras, fotos, LED, dispositivos) **se reutilizan con las URLs existentes**: las políticas ya dejan entrar al docente asignado. En `/api/docente` solo va lo propio del docente:

| Endpoint | Función |
|---|---|
| `GET /api/docente/resumen` | Indicadores: estudiantes activos, proyectos en curso y finalizados, % de bitácoras al día (7 días), dispositivos en línea |
| `GET /api/docente/proyectos?estado=activos\|finalizados&alerta=` | Tabla del semáforo. **Una sola consulta agregada** (JOIN + MAX), sin N+1 |
| `POST /api/docente/proyectos/:id/finalizar` | Registra `fecha_fin = CURDATE()`; no desvincula dispositivos (D2) |
| `POST /api/docente/proyectos/:id/reabrir` | Pone `fecha_fin = NULL` |
| `PUT /api/docente/proyectos/:id/docente` | Reasigna el proyecto a otro docente de la misma institución |
| `PATCH /api/docente/fotografias/:id` | `{ oculta: true\|false }`, que se guarda como `estado` 0/1 |
| `GET /api/docente/exportar.csv` | Estudiante, proyecto, planta, bitácoras de los últimos 7 y 30 días, retos cumplidos, última lectura y estado de los dispositivos |

#### 6.2 Reglas del semáforo (`config/catalogos.js`, ajustables)

| Nivel | Condición (valor inicial propuesto) |
|---|---|
| 🔴 Sin bitácora | 3 días o más sin registro |
| 🔴 Planta en riesgo | humedad de suelo < 30 %, o temperatura < 10 °C o > 35 °C, en la última lectura válida |
| 🟠 Dispositivo sin conexión | `fecha_ultimo_contacto` > 30 min (el ESP32 reporta cada 5 min) |
| 🟠 Sensor desconectado | las últimas 3 lecturas con todos los valores en 0 |
| 🟡 Retos incompletos | la bitácora de hoy tiene menos de 6 retos |
| 🟢 Al día | ninguna de las anteriores |

#### 6.3 Frontend docente (reemplaza la maqueta de `docente.html`)

- **Panel:** indicadores + tabla del semáforo con filtros (alerta, activos o finalizados) y búsqueda por estudiante.
- **Ficha de proyecto:**
  - datos generales y estado de los dispositivos;
  - línea de tiempo unificada de bitácoras, fotos y lecturas;
  - comparador de fotos antes/después;
  - gráfica de sensores con las bitácoras marcadas.
- **Gestión:** editar, configurar LED, vincular o desvincular, finalizar o reabrir, reasignar, archivar y ocultar fotos. Cada acción tiene confirmación y los botones se deshabilitan según las reglas.
- **Exportar CSV.**

#### 6.4 Lado del estudiante

- [ ] El proyecto finalizado se muestra en modo lectura, con el aviso "Proyecto finalizado por tu docente".
- [ ] La lista de docentes queda filtrada por institución (hecho en la fase 2).

#### 6.5 Cuentas de docente

- [ ] `scripts/crear-docente.js`: se ejecuta en local y genera un `INSERT` con el hash bcrypt, para importar en phpMyAdmin. Mientras no exista un módulo de administración, los docentes se crean así.

**Aceptación:**
- El docente solo ve proyectos donde `id_docente` es él.
- Las acciones respetan la matriz de permisos.
- El CSV abre bien en Excel: UTF-8 con BOM y separador `;`.

### Fase 7 — Migraciones SQL (se importan a mano en Plesk)

Cada archivo va en `src/backend/migraciones/`:
- es **idempotente**, es decir, se puede ejecutar más de una vez sin romper nada;
- registra su ejecución en `tbl_migraciones`;
- se importa **después de un respaldo de la BD**.

| Archivo | Contenido | Cuándo |
|---|---|---|
| `001_base.sql` | Crea `tbl_migraciones`; convierte todas las tablas a `utf8mb4`; agrega el índice `(id_proyecto, estado, fecha_registro)` en `tblh_registros_monitoreo`; elimina el índice duplicado de `tblh_bitacoras_diarias` | En cualquier momento; es independiente del código |
| `002_auditoria.sql` *(opcional)* | `tblh_auditoria` (usuario, acción, entidad, id de la entidad, detalle JSON, fecha) | Antes de la fase 6, si se aprueba (D1) |
| `003_cuestionarios.sql` | Temas, banco de preguntas, cuestionarios, intentos y respuestas, con 30 preguntas iniciales | **Obligatoria antes de subir el código de cuestionarios**: sin estas tablas, las pantallas de cuestionarios responden error |

---

## 5. Entregas a Plesk

Se proponen **dos entregas** para no mezclar el cierre de seguridad con funcionalidad nueva:

| Entrega | Incluye | Migración SQL |
|---|---|---|
| **A — Seguridad y capas** | Fases 1–5 | `001_base.sql` (recomendada, no obligatoria) |
| **B — Módulo docente** | Fase 6 | `002_auditoria.sql` si se aprueba |

Si se prefiere, ambas pueden ir en una sola subida, pero entonces el riesgo de cada despliegue es mayor.

### Procedimiento de despliegue

1. **Respaldo:**
   - desde el Administrador de archivos, zip de `httpdocs/src`;
   - desde phpMyAdmin, export completo de `rural40_db`.
2. **SQL:** si la entrega trae migración, se importa primero y se verifica `SELECT * FROM tbl_migraciones`.
3. **Paquete:** `scripts/empaquetar-despliegue.ps1` (solo local) arma un zip con:
   - `src/backend`: `server.js`, `db.js`, `session.js`, `package.json`, `package-lock.json`, `config/`, `lib/`, `middlewares/`, `policies/`, `services/`, `repositories/`, `routes/`, `scripts/`;
   - `src/frontend/` completo.

   El paquete **excluye** `.env`, `.plesk.startup.cjs`, `tmp/`, `.node-version`, `uploads/`, `node_modules/`, `esp32-firmware/`, `migraciones/`, `tests/`, logs, `PLAN-MIGRACION.md` y `rural40_db.sql`.
4. **Subir y extraer** en `httpdocs/src`, sobrescribiendo solo lo que trae el paquete.
5. **NPM install** desde el panel Node.js, solo si cambió `package.json`.
6. **Reiniciar:** "Restart App" en el panel, o actualizar la fecha de `src/backend/tmp/restart.txt`.
7. **Pruebas de humo:** ver la sección 6.2.
8. **Si algo falla:** restaurar el zip del paso 1 y reiniciar. Las migraciones SQL no rompen la versión anterior: son aditivas o de charset.

---

## 6. Pruebas

### 6.1 Automáticas (`npm test`, en local)

- La matriz de permisos completa por rol: estudiante dueño, estudiante ajeno, docente asignado, docente no asignado y administrador.
- Endpoints sin sesión → 401. Con otro rol → 403. Recurso ajeno → 404, para no revelar que existe.
- El proyecto finalizado rechaza bitácoras, fotos y lecturas.
- El semáforo, con lecturas simuladas: sensor en 0, suelo seco, dispositivo sin conexión y bitácora atrasada.
- `escapeHtml` y la exportación CSV.

### 6.2 Manuales, en Plesk después de desplegar

- [ ] `GET /api/health` y `/api/health/db` → `ok`.
- [ ] Login como estudiante → dashboard, proyectos, bitácora, subir foto y gráficas.
- [ ] Cambiar `usuario_id` o `id_proyecto` en la URL a mano → no devuelve datos ajenos.
- [ ] `GET /api/config` ya no contiene la clave.
- [ ] ESP32 de sensores: nueva fila en `tblh_registros_monitoreo` y `fecha_ultimo_contacto` actualizada.
- [ ] ESP32-CAMERA: foto recibida y `fecha_ultimo_contacto` actualizada.
- [ ] OTA: `GET /api/firmware/latest` con `X-Device-Key` responde 200 o 204.
- [ ] *(Entrega B)* Login como docente → panel con datos reales, ficha, gestión y CSV.
- [ ] *(Entrega B)* Un docente no ve proyectos de otro docente.

---

## 7. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| La copia local no coincide con producción | Fase 0: confirmar o volver a descargar antes de empezar |
| Romper los ESP32 instalados | URLs y headers del firmware congelados; prueba con equipo físico en la fase 4 |
| Subir el frontend sin el backend, o al revés | Paquete único por entrega |
| Pisar fotos o configuración de producción | El script de empaquetado excluye lo del entorno |
| Error en la migración SQL | Respaldo previo, scripts idempotentes y cambios aditivos |
| Sesiones abiertas durante el despliegue | La cookie no cambia de formato, así que las sesiones siguen siendo válidas |

---

## 8. Pendientes posteriores (fuera del MVP)

- **Retroalimentación del docente** visible para el estudiante, con aviso por correo (`003_retroalimentaciones.sql`).
- **Altura de la planta como número** en el reto "crecer" (`004_altura_bitacora.sql`).
- **Experimentos de clase:** agrupar proyectos por condición (LED o tierra) y comparar resultados (`005_experimentos.sql`).
- **Seguridad adicional:**
  - límite de intentos en login, verificación y recuperación;
  - quitar `tls.rejectUnauthorized: false` del SMTP;
  - escapar los nombres en las plantillas de correo;
  - rotar los secretos del `.env`.
- **Configuración de Plesk:**
  - comprobar la raíz del documento del dominio y si nginx sirve estáticos directamente, porque eso salta las protecciones de Express;
  - evaluar la extensión Git de Plesk para desplegar.
- **Firmware:** sincronizar la hora por NTP; hoy `fecha_lectura` llega fija.

---

## 9. Decisiones pendientes

| # | Decisión | Propuesta |
|---|---|---|
| D1 | ¿Auditoría de acciones del docente desde el MVP? | Sí (`002_auditoria.sql`) |
| D2 | Al finalizar un proyecto, ¿se desvinculan los dispositivos automáticamente? | **Decidido: NO.** Los dispositivos siguen vinculados y sus lecturas y fotos se siguen aceptando; el docente los desvincula a mano si quiere reutilizarlos. El estudiante ya no puede registrar bitácoras ni subir fotos desde la web |
| D3 | Umbrales del semáforo | Los de la sección 6.2; validar con un docente |
| D4 | ¿Una o dos entregas a Plesk? | Dos (A: seguridad, B: docente) |
| D5 | ¿Qué ve el administrador? | Lo mismo que un docente, pero de todos los proyectos. Sin interfaz propia en el MVP |
