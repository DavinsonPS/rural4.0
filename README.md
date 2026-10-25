# Rural 4.0

Aplicación local para el monitoreo de plantas mediante un backend Node.js, una interfaz web y dispositivos ESP32.

## Requisitos

- Node.js 20 o superior.
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
DB_PASSWORD=REEMPLAZAR_CON_LA_CLAVE_CONFIGURADA_EN_MARIADB
DB_CONNECTION_LIMIT=10

SESSION_SECRET=REEMPLAZAR_CON_UN_SECRETO_ALEATORIO
DEVICE_PROVISIONING_KEY=REEMPLAZAR_CON_LA_CLAVE_DE_APROVISIONAMIENTO
DEVICE_REGISTRATION_KEY=REEMPLAZAR_CON_LA_CLAVE_DE_REGISTRO
APP_URL=http://localhost:3000
```

Los valores `REEMPLAZAR_...` son marcadores de ejemplo, no credenciales. Genera o configura
valores propios en el archivo `.env` local o en el gestor de secretos del servidor; nunca pegues
credenciales reales en el README ni en otros documentos versionados.

`SESSION_SECRET` y las variables de conexión a la base de datos son obligatorias para iniciar la aplicación. Configura también `OPENAI_API_KEY` y `MODELO` para habilitar Guardián. La plantilla completa está en `src/backend/.env.example`. MCP (`/mcp`), el agente Guardián (`/api/guardian`) y la página comparten el mismo proceso y puerto. El servidor web inicia sin esperar a la base de datos; mientras MCP o Guardián no estén listos, sus rutas reciben 503 y el backend reintenta la inicialización cada 30 segundos. Consulta `/api/health` para ver el estado de ambos servicios.

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
- MCP (clientes Streamable HTTP): <http://localhost:3000/mcp> (requiere una sesión activa de estudiante o docente)
- API del agente Guardián: <http://localhost:3000/api/guardian> (sesión activa de estudiante)

Para detenerlo, presiona `Ctrl+C`.

## 5. Flujo de prueba local

1. Abre `http://localhost:3000`.
2. Registra o inicia sesión con un usuario existente.
3. Crea o selecciona un proyecto.
4. Abre `Mi planta` para consultar las mediciones y gráficas del proyecto.
5. Abre `Misiones` para revisar el estado de la planta, el historial de retos y completar los objetivos diarios.
6. Verifica las bitácoras guardadas en `Mis registros`.
7. Si usas un ESP32, registra y vincula el dispositivo desde la sección de hardware.

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

## Pruebas automatizadas

Pruebas unitarias (no necesitan base de datos), desde `src/backend`:

```powershell
npm test
```

Cubren políticas de acceso, semáforo, utilidades, rutas, cuestionarios, administración y cámara.

Pruebas de extremo a extremo (necesitan la base local en Docker y el servidor corriendo):

```powershell
node local/pruebas/todas.mjs
```

Guía para levantar el entorno local: [local/README.md](local/README.md).

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
.
├── AGENTE/                Servicio del agente educativo Guardián y sus conversaciones
│   ├── src/               Rutas HTTP y servicio que conecta OpenAI con herramientas MCP
│   └── test/              Pruebas del servicio del agente
├── MCP/                   Servidor Model Context Protocol y herramientas de consulta
│   └── test/              Pruebas del servidor, herramientas y autenticación
├── db/                    Esquema y documentación de la base de datos
├── esp32/                 Sketch Arduino del ESP32 de sensores y configuración Wokwi
├── esp32-camara/          Sketch antiguo de cámara (obsoleto; ver OBSOLETO.md)
├── firmware/
│   └── esp32-camara/      Firmware vigente de la ESP32-CAM (PlatformIO)
├── local/                 Docker, simulador y pruebas E2E para desarrollo local
├── scripts/               Herramientas de empaquetado para despliegue
└── src/
    ├── backend/           Aplicación Express: API, frontend estático y servicios
    │   ├── routes/        Rutas HTTP y API
    │   ├── middlewares/   Autenticación, errores y acceso de dispositivos
    │   ├── policies/      Reglas de acceso a proyectos
    │   ├── services/      Lógica de negocio
    │   ├── repositories/  Consultas y persistencia MySQL
    │   ├── migraciones/   Migraciones de la base de datos
    │   └── tests/         Pruebas automatizadas del backend (npm test)
    └── frontend/          HTML, CSS y JavaScript de estudiante, docente y administrador
        ├── css/           Estilos por pantalla y funcionalidad
        └── js/            Dashboard, módulos por rol y utilidades compartidas
```

El backend aloja `/mcp` y `/api/guardian` en el mismo proceso. `MCP/` contiene el servidor
MCP y sus herramientas de consulta; `AGENTE/` contiene el agente Guardián que las utiliza
para responder en el chat del estudiante.

Roles: **estudiante** (proyectos, monitoreo, bitácoras, cuestionarios), **docente** (semáforo de sus
estudiantes, fichas de proyecto, cuestionarios con banco de preguntas) y **administrador** (usuarios
con invitación por correo, catálogos, dispositivos y auditoría).

Más documentación:

- [MAPA-SISTEMA.md](MAPA-SISTEMA.md): mapa completo (rutas, tablas, archivos).
- [CAMBIOS.md](CAMBIOS.md): qué cambió respecto a la versión anterior.
- [PLAN-MIGRACION.md](PLAN-MIGRACION.md): plan de la migración a capas y del módulo docente.
- [DESPLIEGUE-PLESK.md](DESPLIEGUE-PLESK.md): cómo actualizar el servidor de Plesk.
- Dispositivos y endpoints: [src/backend/esp32-firmware/README.md](src/backend/esp32-firmware/README.md).
