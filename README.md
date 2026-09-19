# Rural 4.0

Aplicación para monitoreo de cultivos con backend Node.js, frontend web y dispositivos ESP32.

## Requisitos

- Node.js 18 o superior
- MariaDB 10.5 o superior
- npm
- PowerShell, Windows Terminal o WSL

## 1. Preparar la base de datos

Desde la raíz del proyecto, crea la estructura base con el único script disponible:

```powershell
mariadb -u root -p < db/rural40_schema.sql
```

Este archivo crea la base `rural40_db` y las tablas principales del sistema. No se usan scripts adicionales de semilla ni migraciones para el arranque inicial.

## 2. Configurar el backend

Copia la plantilla del entorno:

```powershell
Copy-Item src/backend/.env.example src/backend/.env
```

Edita `src/backend/.env` con tus valores locales. Un ejemplo mínimo es:

```dotenv
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=rural40_db
DB_USER=BD_SYSTEM_RURAL40
DB_PASSWORD=tu_password_local
DB_CONNECTION_LIMIT=10

DEVICE_REGISTRATION_KEY=cambia-esta-clave-local
SESSION_SECRET=cambia-este-secreto-local
APP_URL=http://localhost:3000
```

Las variables SMTP solo son necesarias para recuperación de contraseña y verificación por correo:

```dotenv
EMAIL_HOST=mail.tu-servidor.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=notificaciones@tu-domino.com
EMAIL_PASS=tu_password_smtp
MAIL_FROM="Rural 4.0" <notificaciones@tu-domino.com>
```

> No publiques `.env` ni guardes credenciales reales en el repositorio.

## 3. Instalar dependencias

```powershell
Set-Location src/backend
npm install
```

## 4. Ejecutar la aplicación

Desde la carpeta del backend:

```powershell
npm start
```

La aplicación queda disponible en:

- Frontend: <http://localhost:3000>
- Health: <http://localhost:3000/api/health>
- Base de datos: <http://localhost:3000/api/health/db>

## 5. Estructura del proyecto

```text
rural4.0/
├── db/
│   ├── README.md
│   └── rural40_schema.sql
├── src/
│   ├── backend/
│   │   ├── .env.example
│   │   ├── db.js
│   │   ├── server.js
│   │   ├── routes/
│   │   └── core/
│   └── frontend/
│       ├── index.html
│       ├── css/
│       └── js/
├── .gitignore
├── package-lock.json
├── package.json
├── README.md
└── .github/
```

## 6. Modelo de base de datos

El esquema central incluye:

- `tbld_roles`
- `tbld_instituciones`
- `tbld_tipos_documentos`
- `tbld_plantas`
- `tbld_dispositivos`
- `tblh_usuarios`
- `tblh_proyectos`
- `tblh_fotografias_monitoreo`
- `tblh_registros_monitoreo`
- `tblh_bitacoras_diarias`

Esto permite manejar usuarios, instituciones, cultivos, proyectos, monitoreo y fotos de forma ordenada.

## 7. Comandos útiles

Actualizar el manifiesto del firmware:

```powershell
Set-Location src/backend
npm run firmware:manifest
```

Validar la sintaxis del dashboard:

```powershell
node --check src/frontend/js/dashboard.js
```

## 8. Problemas frecuentes

### La base no se crea

Verifica que MariaDB esté corriendo y que la cuenta usada tenga permisos de creación en la instancia.

### La aplicación no conecta a la base

Confirma que `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD` estén correctos en `.env`.

### El puerto está ocupado

Cambia `PORT` en `src/backend/.env` antes de iniciar el servidor.

### No llegan correos

Revisa las variables SMTP del entorno; el sistema puede iniciar sin ellas, pero la recuperación y verificación de correo quedarán deshabilitadas.

Para más detalle del esquema, consulta [db/README.md](db/README.md).
