# Rural 4.0

Aplicación local para el monitoreo de plantas mediante un backend Node.js, una interfaz web y dispositivos ESP32.

## Requisitos

- Node.js 18 o superior.
- MariaDB 10.5 o superior.
- npm.
- PowerShell, Windows Terminal o WSL.

## 1. Preparar la base de datos

Desde la carpeta raíz del proyecto, ejecuta el esquema inicial con una cuenta administradora de MariaDB:

```powershell
mariadb -u root -p < db/rural40_schema.sql
```

Carga los catálogos y datos iniciales:

```powershell
mariadb -u root -p < db/seed_rural40_datos_iniciales.sql
```

Para agregar el catálogo de plantas con cambios visibles asociados a la luz:

```powershell
mariadb -u root -p < db/seed_plantas_fotosensibles.sql
```

El script agrega 10 especies aptas para actividades escolares y puede ejecutarse más de una vez sin duplicarlas.

El esquema ya incluye las tablas principales de proyectos, monitoreo, fotografías y bitácoras diarias. Para una base existente, revisa las migraciones de la carpeta `db/` y ejecútalas según la antigüedad de la instalación. Las más habituales son:

```powershell
mariadb -u root -p < db/migrate_users.sql
mariadb -u root -p < db/migrate_daily_logs.sql
mariadb -u root -p < db/migrate_password_recovery.sql
```

No ejecutes migraciones a ciegas sobre una base que ya está actualizada. Consulta [db/README.md](db/README.md) para el detalle de cada script.

### Usuario de la aplicación

Opcionalmente, crea el usuario técnico recomendado:

```powershell
mariadb -u root -p < db/create_db_user.sql
```

El script crea `BD_SYSTEM_RURAL40` con permisos de lectura y escritura sobre `rural40_db`. Cambia la contraseña del script antes de usarla en un entorno compartido y coloca ese mismo valor en `DB_PASSWORD`.

## 2. Configurar el backend

Copia la plantilla de variables de entorno:

```powershell
Copy-Item src/backend/.env.example src/backend/.env
```

Edita `src/backend/.env` y configura como mínimo:

```dotenv
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=rural40_db
DB_USER=BD_SYSTEM_RURAL40
DB_PASSWORD=la_contrasena_definida_para_el_usuario
DB_CONNECTION_LIMIT=10

DEVICE_REGISTRATION_KEY=cambia-esta-clave-local
SESSION_SECRET=cambia-este-secreto-local
APP_URL=http://localhost:3000
```

Las variables `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASS` y `MAIL_FROM` solo son necesarias para probar recuperación de contraseña y verificación por correo. No publiques el archivo `.env` ni sus contraseñas.

## 3. Instalar dependencias

Instala las dependencias del backend:

```powershell
Set-Location src/backend
npm install
```

## 4. Ejecutar la aplicación

Desde `src/backend`, inicia el servidor:

```powershell
npm start
```

El backend sirve la API y el frontend en el mismo puerto. Abre:

- Aplicación: <http://localhost:3000>
- Salud del servidor: <http://localhost:3000/api/health>
- Salud de la base de datos: <http://localhost:3000/api/health/db>

Para detenerlo, presiona `Ctrl+C`.

## 5. Flujo de prueba local

1. Abre `http://localhost:3000`.
2. Registra o inicia sesión con un usuario existente.
3. Crea o selecciona un proyecto.
4. Abre `Mi planta` y guarda una bitácora.
5. Verifica el registro en `Mis registros` y el estado de la rutina diaria.
6. Si usas un ESP32, registra y vincula el dispositivo desde la sección de hardware.

El backend guarda las fotografías en `src/backend/uploads/photos/`. Esta carpeta debe tener permisos de escritura.

## Comandos útiles

Actualizar el manifiesto de firmware:

```powershell
Set-Location src/backend
npm run firmware:manifest
```

Comprobar la sintaxis del dashboard:

```powershell
node --check src/frontend/js/dashboard.js
```

## Problemas frecuentes

### Faltan variables de entorno de base de datos

Confirma que `src/backend/.env` existe y contiene `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD`.

### No se puede conectar a MariaDB

Comprueba que el servicio esté iniciado, que la base `rural40_db` exista y que las credenciales de `.env` coincidan con MariaDB. También puedes consultar `/api/health/db`.

### El puerto 3000 está ocupado

Cambia `PORT` en `src/backend/.env` y abre la aplicación usando el nuevo puerto.

### No llegan correos

Revisa las variables SMTP. El servidor puede iniciar sin ellas, pero las funciones de recuperación y verificación de correo no funcionarán.

## Estructura principal

```text
Desarrollo/
├── db/                    Scripts de esquema, migraciones y datos iniciales
├── esp32/                 Firmware y simulación del ESP32
├── esp32-camara/          Firmware y simulación de la ESP32-CAM
└── src/
    ├── backend/           API Express, conexión MariaDB y archivos subidos
    └── frontend/          HTML, CSS y JavaScript de la aplicación web
```

Para configurar los dispositivos y sus endpoints, consulta [src/backend/esp32-firmware/README.md](src/backend/esp32-firmware/README.md).
