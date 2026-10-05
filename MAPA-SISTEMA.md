# Mapa del sistema — Rural 4.0

Estado al 27-sep-2026 (commit `75339ee`). Documento de referencia del proyecto: qué hay, dónde
está y cómo se conecta. **No se sube a Plesk** (el paquete de despliegue no lo incluye).

---

## 1. Qué es

Plataforma educativa de "ciencia en el campo": cada **estudiante** cultiva una planta en un
proyecto, la monitorea con un **ESP32 de sensores** (temperatura, humedad del aire, humedad del
suelo, luz) y una **ESP32-CAMERA**, registra bitácoras diarias con 6 retos, sube fotos y responde
cuestionarios. El **docente** acompaña: ve un semáforo de quién necesita atención, gestiona los
proyectos, crea cuestionarios por tema y revisa resultados. **Guardián**, la mascota, acompaña al
estudiante con mensajes según el estado de su planta.

| Rol | Entra a | Puede |
|---|---|---|
| ESTUDIANTE | `estudiante.html` | Crear y gestionar sus proyectos, vincular dispositivos, bitácoras, fotos, cuestionarios |
| DOCENTE | `docente.html` | Seguimiento de los proyectos donde lo eligieron, gestión, cuestionarios y resultados |
| ADMINISTRADOR | `admin.html` (y `docente.html`) | Usuarios, instituciones, plantas, dispositivos, auditoría; y el panel docente sobre todos los proyectos |
| ESP32 / ESP32-CAMERA | API con `X-Device-Key` | Enviar lecturas y fotos, leer su configuración, actualizar firmware (OTA) |

---

## 2. Infraestructura

```
                         ┌──────────────── Plesk · rural40.ml-ware.com ────────────────┐
 Navegador (estudiante,  │  nginx/Apache ─► Phusion Passenger ─► .plesk.startup.cjs     │
 docente, administrador) │                                        └─► src/backend/      │
        │  HTTPS         │                                             server.js (Node 24│
        ├───────────────►│                                             Express 5)        │
        │                │                                               │   │           │
 ESP32 de sensores ─────►│   /api/dispositivos · /api/monitoreo · /api/firmware          │
 ESP32-CAMERA ──────────►│                                               │   │           │
   (X-Device-Key)        │        MariaDB 11.4 · rural40_db ◄────────────┘   │           │
                         │        SMTP mail.rural40.ml-ware.com:465 ◄────────┘ (correos) │
                         └──────────────────────────────────────────────────────────────┘
```

- **Código en el servidor:** `httpdocs/src` (`src/backend` = raíz de la app Node, `src/frontend` = estáticos).
- **Reinicio:** "Restart App" en el panel Node.js o actualizar `src/backend/tmp/restart.txt`.
- **Base de datos:** MariaDB 11.4 en Plesk, hora de Colombia (`NOW()` = UTC-5). Los cambios de esquema se importan a mano en phpMyAdmin (`src/backend/migraciones/*.sql`).
- **Archivos de producción que no se tocan:** `.env`, `.plesk.startup.cjs`, `tmp/`, `.node-version`, `uploads/`, `node_modules/`, `esp32-firmware/`.

---

## 3. Estructura del repositorio

```
rural/
├── MAPA-SISTEMA.md · PLAN-MIGRACION.md     documentación (no se despliega)
├── .gitignore · .gitattributes             excluye .env, uploads, node_modules, volcados .sql
├── scripts/empaquetar-despliegue.ps1       arma el zip para Plesk (solo código)
├── local/                                  entorno de pruebas (no se despliega)
│   ├── docker-compose.yml                  MariaDB 11.4 + volcado + migraciones
│   ├── 90_claves_locales.sql               contraseña Rural40-local para todas las cuentas (solo local)
│   ├── simular-esp32.ps1                   simula sensor o cámara con las rutas reales del firmware
│   └── README.md
└── src/
    ├── backend/                            ← app Node (raíz de Passenger)
    │   ├── server.js                       monta rutas, estáticos, protección de páginas, errores
    │   ├── db.js                           pool mysql2 (utf8mb4)
    │   ├── session.js                      cookie firmada rural40_session (HMAC, 8 h)
    │   ├── .env (prod, no versionado) · .env.local (pruebas)
    │   ├── .plesk.startup.cjs · tmp/ · .node-version        entorno Plesk
    │   ├── config/catalogos.js             valores permitidos y umbrales (LED, tierra, semáforo)
    │   ├── lib/                            errores HTTP, handler, fechas Colombia, CSV, escape HTML
    │   ├── middlewares/                    auth (sesión/rol), device-auth (X-Device-Key), errores
    │   ├── policies/proyectos.policy.js    quién puede ver/gestionar/supervisar/registrar
    │   ├── routes/                         capa HTTP (7 routers)
    │   ├── services/                       reglas de negocio (10 servicios)
    │   ├── repositories/                   SQL (10 repositorios + transacción)
    │   ├── migraciones/                    001_base · 002_auditoria · 003_cuestionarios
    │   ├── scripts/                        crear-docente.js · update-firmware-manifest.js
    │   ├── tests/                          34 tests (node --test, sin BD)
    │   ├── esp32-firmware/                 firmware.bin OTA, manifest, first-install/
    │   └── uploads/photos/AAAA/MM/         fotos (producción, no versionado)
    └── frontend/                           ← estáticos servidos por Express
        ├── index.html · registro.html · recuperar.html · restablecer.html
        ├── estudiante.html · docente.html
        ├── css/  styles.css · login.css · docente.css · cuestionarios.css · guardian.css
        └── js/
            ├── login.js · registro.js · recuperar.js · restablecer.js · auth-switch.js
            ├── dashboard.js                dashboard del estudiante (módulo ES)
            ├── lib/        api.js · sesion.js · html.js · charts.js      (compartidos)
            ├── estudiante/ cuestionarios.js · guardian.js · guardian-svg.js
            └── docente/    main.js · panel.js · proyecto.js · gestion.js · cuestionarios.js · formato.js
```

---

## 4. Arquitectura del backend

```
Petición ─► middlewares ─► routes ─► services ─► repositories ─► MariaDB
            (quién eres)   (HTTP)    (reglas +     (SQL, sin
                                      políticas)    reglas)
```

| Capa | Archivos | Responsabilidad |
|---|---|---|
| middlewares | `auth.js`, `device-auth.js`, `error-handler.js` | `requireSession` (cookie + usuario activo en BD), `requireRole`, `requireSessionOrRegistrationKey`, `requireDevice`; errores → JSON; 404 JSON en `/api` |
| routes | `auth`, `projects`, `monitoring`, `devices`, `firmware`, `docente`, `cuestionarios` | Leer la petición, llamar al servicio, responder |
| services | `proyectos`, `bitacoras`, `fotografias`, `lecturas`, `dispositivos`, `docente`, `semaforo`, `cuestionarios`, `auditoria` | Validaciones, reglas de producto, permisos |
| policies | `proyectos.policy.js` | `canView`, `canManage`, `canSupervise`, `canRecord`, `assertCan` |
| repositories | `usuarios`, `catalogos`, `proyectos`, `bitacoras`, `fotografias`, `lecturas`, `dispositivos`, `auditoria`, `cuestionarios`, `transaccion` | Consultas parametrizadas y transacciones |

`auth.routes.js` (login, registro, recuperación) conserva su SQL original dentro de la ruta.

### Reglas de acceso a un proyecto

| | Estudiante dueño | Docente asignado | Administrador | Clave interna |
|---|:-:|:-:|:-:|:-:|
| Ver (resumen, lecturas, bitácoras, fotos) | ✅ | ✅ | ✅ | ✅ |
| Gestionar (editar, LED, vincular, archivar) | ✅ si no está finalizado | ✅ | ✅ | ✅ |
| Supervisar (finalizar, reabrir, reasignar, ocultar fotos) | ❌ | ✅ | ✅ | ❌ |
| Registrar (bitácoras, fotos web) | ✅ si no está finalizado | ❌ | ❌ | ❌ |

Si no puede ver el proyecto la respuesta es **404** (no revela que existe).

---

## 5. API completa (87 rutas: 84 en los 8 routers + 3 del sistema)

Novedades de la cámara (ver `CAMBIOS.md`): `GET /api/monitoreo/timelapse?id_proyecto=&rango=24h|7d|30d|todo&max=`,
`GET /api/monitoreo/fotografias?origen=estudiante|camara`, y el firmware se elige por modelo:
el OTA según el dispositivo que pregunta y la primera instalación con `?tipo=camara`
(`esp32-firmware/camara/`).

### Administración — `/api/admin` (solo ADMINISTRADOR)

| Ruta | |
|---|---|
| `GET /resumen` | Totales de usuarios, proyectos, dispositivos, cuestionarios y firmware OTA publicado |
| `GET /usuarios/catalogos` · `GET /usuarios?rol=&estado=&institucion=&q=` | Catálogos del formulario y listado con filtros |
| `POST /usuarios` | Crea DOCENTE o ADMINISTRADOR y envía invitación (enlace de 72 h para crear contraseña) |
| `PUT /usuarios/:id` · `PATCH /usuarios/:id/rol` · `PATCH /usuarios/:id/estado` | Editar, cambiar rol, activar/desactivar |
| `POST /usuarios/:id/acceso` | Reenvía invitación (si nunca entró) o enlace de restablecimiento (24 h) |
| `GET/POST /instituciones` · `PUT /instituciones/:id` · `PATCH /instituciones/:id/estado` | Catálogo de instituciones |
| `GET/POST /plantas` · `PUT /plantas/:id` · `PATCH /plantas/:id/estado` | Catálogo de plantas |
| `GET /dispositivos` · `POST /dispositivos/:id/desvincular` · `PATCH /dispositivos/:id/estado` | Todos los ESP32, liberar de un proyecto, activar/desactivar |
| `GET /auditoria?accion=&desde=&hasta=&limite=&desplazamiento=` | Historial de acciones de gestión |

Reglas: nadie se desactiva ni se cambia el rol a sí mismo; siempre queda al menos un
administrador activo; no se cambia el rol de un docente con proyectos a cargo ni de un
estudiante con proyectos activos; un dispositivo vinculado no se desactiva.

Leyenda de acceso: **pública** · **sesión** (cualquier rol) · **est.** (sesión de estudiante) ·
**doc.** (docente o administrador) · **dispositivo** (`X-Device-Key`) · **provisión**
(`X-Provisioning-Key`) · **interna** (`X-Registration-Key`).

### Usadas por el firmware del ESP32 — no cambiar URL ni headers

| Método y ruta | Acceso | Qué hace |
|---|---|---|
| `POST /api/dispositivos/provisionar` | provisión | Registra o reprovisiona la placa; devuelve `api_key` y código de vinculación |
| `GET /api/dispositivos/configuracion` | dispositivo | Proyecto, LED (configuración, color, brillo) y tipo de tierra |
| `POST /api/monitoreo/lecturas` | dispositivo (vinculado) | Guarda temperatura, humedades y luz |
| `POST /api/monitoreo/fotografias` | dispositivo (cámara) | JPEG crudo de la ESP32-CAMERA |
| `GET /api/firmware/latest` · `/download` | dispositivo | OTA: manifiesto y binario validados por SHA-256 |
| `GET /api/firmware/download-inicial` · `/first-install/manifest` · `/first-install/files/:f` | pública | Primera instalación por USB |
| `GET /api/firmware/status` | interna | Estado del firmware publicado |

### Autenticación — `/api/auth`

| Ruta | Acceso | |
|---|---|---|
| `POST /login` · `POST /logout` | pública | Cookie `rural40_session` |
| `GET /me` | sesión | Usuario, rol e institución (fuente de identidad del frontend) |
| `GET /instituciones` · `GET /tipos-documento` | pública | Catálogos del registro |
| `POST /register/request` · `POST /register/verify` | pública | Registro con código por correo (rol ESTUDIANTE) |
| `POST /forgot-password` · `POST /reset-password` | pública | Recuperación con enlace de 30 min |

### Proyectos — `/api/proyectos`

| Ruta | Acceso | |
|---|---|---|
| `GET /plantas` | pública | Catálogo de plantas |
| `GET /docentes` | sesión | Docentes de la institución del usuario |
| `GET /` · `POST /` | est. | Mis proyectos / crear proyecto |
| `PUT /:id` · `DELETE /:id` | sesión + gestionar | Editar / archivar |
| `GET /resumen/:id` · `GET /resumen/:id/lecturas` | sesión + ver | Resumen con última lectura / historial (2016 lecturas) |

### Monitoreo — `/api/monitoreo`

| Ruta | Acceso | |
|---|---|---|
| `GET /bitacoras?id_proyecto=` | sesión + ver | Bitácoras del proyecto |
| `POST /bitacoras` · `PUT /bitacoras/:id` · `DELETE /bitacoras/:id` | sesión + registrar | Una bitácora por día |
| `POST /fotografias` | sesión + registrar (o cámara) | Foto desde la web (multipart) |
| `GET /fotografias?id_proyecto=` | sesión + ver | Álbum (el docente también ve las ocultas) |

### Dispositivos desde el dashboard — `/api/dispositivos`

| Ruta | Acceso | |
|---|---|---|
| `GET /pendientes` | sesión o interna | Provisionados en las últimas 24 h sin proyecto |
| `POST /registrar` | sesión o interna | Registro manual (genera `api_key`) |
| `GET /proyectos/:id/estado` | sesión o interna + ver | Sensor y cámara del proyecto |
| `POST /proyectos/:id/vincular` | sesión o interna + gestionar | Vincular sensor o cámara |
| `POST /proyectos/:id/configuracion` | sesión o interna + gestionar | LED y tierra |
| `DELETE /proyectos/:id?tipo_dispositivo=` | sesión o interna + gestionar | Desvincular |

### Docente — `/api/docente` (doc.)

| Ruta | |
|---|---|
| `GET /resumen` · `GET /proyectos?estado=activos\|finalizados\|todos` | Indicadores y semáforo |
| `GET /proyectos/:id/docentes` · `PUT /proyectos/:id/docente` | Reasignar a otro docente de la institución |
| `POST /proyectos/:id/finalizar` · `POST /proyectos/:id/reabrir` | Finalizar no desvincula dispositivos |
| `PATCH /fotografias/:id` | Ocultar / mostrar foto |
| `GET /exportar.csv` | Seguimiento del curso para Excel |
| `GET /temas` · `GET/POST /banco` · `PUT/DELETE /banco/:id` | Temas y banco de preguntas |
| `GET/POST /cuestionarios` · `GET/PUT/DELETE /cuestionarios/:id` · `POST /cuestionarios/:id/publicar` | Cuestionarios |
| `GET /cuestionarios/:id/resultados` · `/resultados.csv` | Resultados por pregunta y por estudiante |
| `GET /proyectos/:id/cuestionarios` | Dominio por tema del estudiante de ese proyecto |

### Cuestionarios del estudiante — `/api/cuestionarios` (est.)

| Ruta | |
|---|---|
| `GET /` | Cuestionarios de sus docentes con estado y puntaje |
| `GET /:id` | Preguntas (sin respuestas correctas hasta el cierre; opciones mezcladas por estudiante) |
| `POST /:id/respuestas` | Un intento; calificado en el servidor |

### Sistema

`GET /api/health` · `GET /api/health/db` · `GET /api/config` (vacío; se conserva por compatibilidad) ·
`/uploads/*` (fotos) · cualquier otra ruta no-API → `index.html`.

---

## 6. Base de datos (`rural40_db`, 22 tablas)

```
tbld_roles ──┐        tbld_instituciones ──┐     tbld_tipos_documentos
             ▼                             ▼            │
        tblh_usuarios ◄─────────────────────────────────┘
          │  ▲   ▲                          tblh_registros_pendientes (registro en curso)
          │  │   └── tblh_recuperacion_claves
          │  └────── tblh_auditoria (002)
          ▼ id_usuario / id_docente
   tblh_proyectos ── id_planta ──► tbld_plantas
      │  │  └── id_dispositivo / id_dispositivo_camara ──► tbld_dispositivos
      │  ├──► tblh_registros_monitoreo (lecturas) ◄── tbld_dispositivos
      │  ├──► tblh_bitacoras_diarias (1 por día)
      │  └──► tblh_fotografias_monitoreo ◄── tbld_dispositivos
      │
 (003) tbld_temas ◄── tblh_preguntas ──► tblh_opciones_pregunta
                        ▲      ▲
   tblh_cuestionarios ──┘      └── tblh_respuestas ──► tblh_intentos ──► tblh_cuestionarios
   (id_docente → tblh_usuarios)    tblh_cuestionario_preguntas (cuestionario ↔ pregunta)

 tblh_versiones_firmware (existe, sin uso: el OTA usa manifest.json)
 tbl_migraciones (001) — registro de migraciones importadas
```

| Tabla | Origen | Uso |
|---|---|---|
| `tbld_roles`, `tbld_instituciones`, `tbld_tipos_documentos`, `tbld_plantas` | original | Catálogos |
| `tblh_usuarios`, `tblh_registros_pendientes`, `tblh_recuperacion_claves` | original | Cuentas, registro y recuperación |
| `tblh_proyectos` | original | Proyecto: estudiante, docente, planta, 2 slots de dispositivo, LED, `fecha_fin` = finalizado, `estado 0` = archivado |
| `tbld_dispositivos` | original | Placas: MAC, serial, modelo, `api_key_hash`, código de vinculación, último contacto |
| `tblh_registros_monitoreo` | original | Lecturas (se ordenan por `fecha_registro`, hora del servidor) |
| `tblh_bitacoras_diarias` | original | Bitácora diaria, `retos_completados` en JSON |
| `tblh_fotografias_monitoreo` | original | Fotos; `estado 0` = oculta por el docente |
| `tblh_versiones_firmware` | original | Sin uso |
| `tbl_migraciones` | 001 | Control de scripts importados |
| `tblh_auditoria` | 002 | Acciones de gestión (finalizar, reasignar, ocultar foto, vincular, publicar…) |
| `tbld_temas`, `tblh_preguntas`, `tblh_opciones_pregunta`, `tblh_cuestionarios`, `tblh_cuestionario_preguntas`, `tblh_intentos`, `tblh_respuestas` | 003 | Cuestionarios por tema (banco inicial: 6 temas, 30 preguntas) |

Migraciones: todas idempotentes; `001` convierte todo a **utf8mb4** e indexa el historial.

---

## 7. Frontend

| Página | Scripts | Contenido |
|---|---|---|
| `index.html` | `login.js`, `auth-switch.js` | Inicio de sesión |
| `registro.html` · `recuperar.html` · `restablecer.html` | uno por página | Registro con código, recuperación y cambio de contraseña |
| `estudiante.html` | `guardian.js`, `dashboard.js`, `estudiante/cuestionarios.js` | Mi proyecto, Mi planta (gráficas), Misiones (6 retos, XP), Cuestionarios, Experimentos (vacío), Mis registros, Fotos, Asistente IA (vacío) |
| `docente.html` | `docente/main.js` | Seguimiento (semáforo), ficha del proyecto, cuestionarios (lista, editor, resultados), exportar CSV |
| `admin.html` | `admin/main.js` | Resumen, usuarios, instituciones, plantas, dispositivos, auditoría (hash `#resumen`, `#usuarios`, …) |
| `restablecer.html?invitacion=1` | `restablecer.js` | Mismo formulario de nueva contraseña, con textos de bienvenida para cuentas invitadas |

- **Sin compilación:** ES modules nativos.
- **Compartidos (`js/lib/`):**
  - `api.js`: `fetch` con 401 → login;
  - `sesion.js`: `/api/auth/me`;
  - `html.js`: `escapeHtml`;
  - `charts.js`: gráficas SVG con marcas de bitácora.
- **Navegación del docente por hash:** `#panel`, `#proyecto/ID`, `#cuestionarios`, `#cuestionario/nuevo`, `#cuestionario/ID`, `#cuestionario/ID/editar`.
- **Guardián:** escucha eventos que emite el dashboard (`rural40:proyecto`, `rural40:lectura`, `rural40:bitacoras`, `rural40:sin-proyecto`, `rural40:registro-guardado`, `rural40:cuestionario-enviado`, `rural40:usuario`). Solo consulta `/api/cuestionarios`. Preferencias por día en `localStorage` (`rural40_guardian`).

---

## 8. Flujos principales

1. **Registro:** formulario → `register/request` (código de 8 caracteres por correo, 15 min) → `register/verify` → usuario ESTUDIANTE.
2. **Login:** bcrypt → cookie firmada 8 h → `estudiante.html` o `docente.html`; cada petición confirma el usuario en BD.
3. **ESP32 nuevo:** flasheo USB (`first-flash.bin` en `0x0`) → red `Rural40-Setup` → Wi-Fi → `provisionar` → el estudiante lo busca en *Pendientes* y lo vincula al proyecto con LED y tierra → lecturas cada 5 min.
4. **Cámara:** igual, con modelo `ESP32-CAMERA`, en el slot de cámara; envía JPEG crudo; la foto marca el reto "foto" de la bitácora del día.
5. **OTA:** copiar `firmware.bin` → `npm run firmware:manifest -- X.Y.Z` → el ESP32 consulta `/latest` y descarga `/download`.
6. **Bitácora:** cada reto se completa en un modal; una bitácora por día; XP = 10 por reto.
7. **Semáforo docente:** 🔴 3+ días sin bitácora o planta en riesgo · 🟠 sensor sin conexión (>30 min), lecturas en 0 o cámara sin fotos · 🟡 sin sensor o retos incompletos · 🟢 al día.
8. **Cuestionarios:**
   - el docente arma el borrador (banco más preguntas propias) y lo publica, con fechas de apertura y cierre;
   - lo reciben todos los estudiantes que lo tienen en un proyecto activo;
   - un intento por estudiante: ve su puntaje al enviar y las respuestas correctas al cierre;
   - el docente ve el acierto por pregunta y por estudiante, y exporta CSV.
9. **Finalizar proyecto:** el docente registra `fecha_fin`; el estudiante queda en modo consulta; los dispositivos siguen enviando datos.

---

## 9. Configuración (`.env`)

| Variable | Uso |
|---|---|
| `PORT` | Ignorado por Passenger; usado en local |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_CONNECTION_LIMIT` | Conexión MariaDB (obligatorias) |
| `SESSION_SECRET` | Firma de la cookie. **Obligatoria**: sin ella la app no arranca |
| `DEVICE_PROVISIONING_KEY` | Clave que envía el firmware al provisionar |
| `DEVICE_REGISTRATION_KEY` | Clave interna para herramientas (ya no se expone al navegador) |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASS`, `MAIL_FROM` | Correos de registro y recuperación |
| `APP_URL` | Base del enlace de recuperación |
| `PYTHON_PATH` | Sin uso (restos de `core/monitoring.py`, eliminado) |

---

## 10. Herramientas

| Comando (desde `src/backend`) | |
|---|---|
| `npm start` | Producción (lo usa Passenger) |
| `npm run dev` | Local con `.env.local` (base Docker en el puerto 3307) |
| `npm test` | 34 tests: políticas, semáforo, CSV, fechas, rutas con sesión, calificación de cuestionarios |
| `npm run firmware:manifest -- 1.0.2` | Regenera `manifest.json` del OTA |
| `npm run usuario:crear -- --nombres … --password … [--rol ADMINISTRADOR]` | Imprime el INSERT de un docente o del **primer administrador** para phpMyAdmin (después, las cuentas se crean desde `admin.html`) |

Desde la raíz: `scripts/empaquetar-despliegue.ps1` (zip para Plesk), `local/simular-esp32.ps1`, `docker compose -f local/docker-compose.yml up -d`.

---

## 11. Verificación de regresión contra la versión original

Prueba del 27-sep-2026: la versión original (`b1b04fb`, tal como estaba en Plesk) y la actual
corriendo a la vez contra la misma base local; mismas peticiones, comparación de código HTTP,
estructura y valores de las respuestas (66 comparaciones).

| Resultado | Cantidad | Detalle |
|---|---:|---|
| Igual | 55 | Todo el contrato del firmware (provisión, configuración, lecturas, fotos de cámara, vinculación con `X-Registration-Key`, LED, desvinculación, OTA, primera instalación), login y cookie, catálogos, datos del estudiante, bitácoras, páginas |
| Igual + campos nuevos | 2 | `resumen`: `finalizado`, `usuario.usuario`, marcas de sensor desconectado · `fotografias`: `id_dispositivo` |
| Cambio esperado (seguridad) | 4 | Sin sesión → 401 en proyectos y resumen; `DELETE` de dispositivos sin credenciales → 401; `/api/no-existe` → 404 JSON |
| Diferente, explicado | 5 | `/api/config` ya no entrega la clave (intencional) · la cámara ahora actualiza `fecha_ultimo_contacto` (corrección) · borrar una bitácora ya borrada da 404 en vez de 200 · `styles.css` y `favicon.svg`: mismo contenido, solo cambian los fines de línea |

Compatibilidad hacia atrás: el frontend viejo en caché sigue funcionando con el backend nuevo
en todo lo que manda cookie, porque el `id_usuario` que envía se ignora. La excepción es la
búsqueda de dispositivos pendientes, que exigía la clave de `/api/config`; se arregla al recargar
la página. Express revalida los estáticos, así que el navegador toma los nuevos al recargar.

---

## 12. Pendientes y riesgos conocidos

| Tema | Estado |
|---|---|
| Prueba con ESP32 físico | Pendiente antes de dar por cerrado el despliegue |
| Código de vinculación visible en *Pendientes* (24 h) | Riesgo residual; se cierra cuando el firmware muestre el código en el equipo |
| Código interno derivado de los últimos 3 bytes de la MAC | **Preexistente**: dos placas con la misma terminación chocan si el firmware no envía `codigo_interno` |
| Fotos ocultas accesibles por URL directa | Nombres aleatorios, no enumerables |
| Límite de intentos en login/registro/recuperación | Pendiente |
| `tls.rejectUnauthorized: false` en SMTP | Pendiente |
| Rotar secretos del `.env` | Recomendado |
| Raíz del documento y estáticos de nginx en Plesk | Verificar que no se salten las protecciones de Express |
| Reloj del ESP32 (`fecha_lectura` fija) | Firmware: sincronizar por NTP |
| Experimentos, Asistente IA (vista del estudiante) | Pantallas vacías, sin funcionalidad |
