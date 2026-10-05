# Pruebas en local

Entorno que replica Plesk en tu equipo: **MariaDB 11.4 en Docker** con el volcado de
producción y las migraciones, y la app Node con `.env.local`. Nada de esta carpeta se
despliega (el script de empaquetado no la incluye).

## Requisitos

- Docker Desktop abierto.
- Node 24 (el mismo de Plesk).
- El volcado `rural40_db.sql`. Por defecto se busca en la raíz del proyecto; si lo moviste:
  `$env:RURAL_DUMP = 'C:\ruta\rural40_db.sql'` antes de levantar la base.

## 1. Levantar la base

```powershell
docker compose -f local/docker-compose.yml up -d
```

La primera vez importa, en orden: el volcado → `001_base.sql` → `002_auditoria.sql` →
`90_claves_locales.sql`. Eso sirve también como ensayo de las migraciones que se importan
en Plesk. El último script **solo existe en local**: pone a todas las cuentas la contraseña
`Rural40-local`.

Para empezar de cero (borra la base local):

```powershell
docker compose -f local/docker-compose.yml down -v
docker compose -f local/docker-compose.yml up -d
```

## 2. Levantar la app

```powershell
cd src/backend
npm run dev
```

Abre <http://localhost:3000>. Tras cambiar código del backend, detén con Ctrl+C y vuelve a
ejecutar `npm run dev` (el modo `--watch` de Node en Windows reinicia el servidor al solo leer
archivos, por eso no se usa). Los cambios de frontend basta con recargar la página.

`npm run dev` usa `.env.local` (base en el puerto 3307, claves de dispositivo locales y sin
correo). El `.env` de producción no se toca.

| Rol | Usuario | Contraseña |
|---|---|---|
| Estudiante | `dpaniagua` (tiene el proyecto con sensor y cámara) | `Rural40-local` |
| Estudiante | `juan.tamayo`, `jdtamayoq`, `danielviloria`, `danielfelipe` | `Rural40-local` |
| Docente | `marruiz` | `Rural40-local` |
| Administrador | `admin.local` (solo existe en la base local) | `Rural40-local` |

Las invitaciones que crea el administrador no se envían por correo en local (no hay SMTP): la
pantalla muestra el enlace para copiarlo y abrirlo.

Registro y recuperación de contraseña responden "servicio de correo no disponible" porque
en local no hay SMTP. Es lo esperado.

## 3. Simular un ESP32

En otra terminal, con la app corriendo:

```powershell
# ESP32 de sensores: se provisiona, te muestra el código y espera a que lo vincules
powershell -ExecutionPolicy Bypass -File local\simular-esp32.ps1

# Sensor con temperatura/humedad en 0 (para ver la alerta "sensor desconectado")
powershell -ExecutionPolicy Bypass -File local\simular-esp32.ps1 -SensorDesconectado

# ESP32-CAMERA enviando una foto cada 30 s
powershell -ExecutionPolicy Bypass -File local\simular-esp32.ps1 -Tipo camara -Foto C:\ruta\foto.jpg -Intervalo 30
```

Usa las mismas rutas y headers que el firmware real (`X-Provisioning-Key`, `X-Device-Key`).

## 4. Pruebas de extremo a extremo

Con la base y el servidor corriendo:

```powershell
node local/pruebas/todas.mjs          # plataforma, cuestionarios, administración y cámara
```

Se pueden repetir sin limpiar la base (usan identificadores únicos en cada corrida).

**Regresión contra la versión que está en Plesk** (compara respuestas de ambas versiones):

```powershell
git worktree add $env:TEMP\rural40-original b1b04fb
New-Item -ItemType Junction -Path "$env:TEMP\rural40-original\src\backend\node_modules" -Target "$PWD\src\backend\node_modules"
(Get-Content src\backend\.env.local) -replace '^PORT=3000','PORT=3001' | Set-Content "$env:TEMP\rural40-original\src\backend\.env.local"
# en otra terminal: cd $env:TEMP\rural40-original\src\backend ; node --env-file=.env.local server.js
node local/pruebas/regresion.mjs
```

## 5. Tests automáticos

```powershell
cd src/backend
npm test
```

No necesitan base de datos.

## Qué revisar antes de subir a Plesk

- [ ] Estudiante: crear proyecto, vincular el ESP32 simulado, ver gráficas, guardar bitácora con foto y con emoji 🌱.
- [ ] Docente: semáforo, ficha del proyecto, finalizar/reabrir, ocultar foto, exportar CSV.
- [ ] Un estudiante no ve proyectos de otro (cambiar el id en la URL de la API).
- [ ] Prueba final con un **ESP32 físico** apuntando al servidor (en Plesk o por túnel).
