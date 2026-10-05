# Base de datos Rural 4.0

## Objetivo

Este directorio contiene el esquema principal de la base de datos del proyecto. Actualmente solo existe un archivo único para crear la estructura base:

- [db/rural40_schema.sql](rural40_schema.sql): crea la base de datos, las tablas y los catalogos iniciales.

No se mantienen scripts adicionales de semillas ni de creación de usuarios en este directorio.

## Relación con las migraciones de la versión 2

`rural40_schema.sql` es el **esquema base original**. La base de producción (Plesk) lo supera y se actualiza con las migraciones versionadas en [src/backend/migraciones/](../src/backend/migraciones/), que se importan **a mano en phpMyAdmin, en orden** y son idempotentes (se pueden repetir):

| Migración | Qué agrega |
|---|---|
| `001_base.sql` | Tabla `tbl_migraciones` (control de lo importado), conversión a utf8mb4 (emojis y tildes) e índices |
| `002_auditoria.sql` | `tblh_auditoria`: registro de acciones del docente y del administrador |
| `003_cuestionarios.sql` | 7 tablas de cuestionarios y el banco inicial de 30 preguntas |

Además, producción ya tiene la columna `tblh_proyectos.id_dispositivo_camara` (cámara vinculada al proyecto), que **no está en este esquema base**. Para una instalación nueva desde cero, ejecuta este esquema y después las 3 migraciones; la columna de la cámara debe agregarse tomando la definición del volcado de producción. Pendiente: regenerar `rural40_schema.sql` desde producción para que vuelva a reflejar el estado real.

Guía completa de despliegue: [DESPLIEGUE-PLESK.md](../DESPLIEGUE-PLESK.md).

## Archivo principal

```bash
mariadb -u USUARIO -p < db/rural40_schema.sql
```

Este script:

- crea la base `rural40_db` si no existe,
- crea todas las tablas del modelo principal,
- inicializa los catalogos base de roles, tipos de documento, plantas e instituciones,
- deja listo el esquema para que la aplicación se conecte.

## Modelo principal

El esquema incluye estas tablas:

- `tbld_roles`: roles del sistema.
- `tbld_instituciones`: instituciones educativas.
- `tbld_tipos_documentos`: tipos de documento.
- `tbld_plantas`: especies o cultivos.
- `tbld_dispositivos`: registro de dispositivos ESP32.
- `tblh_usuarios`: usuarios del sistema con sus datos y credenciales en hash.
- `tblh_proyectos`: proyectos de cada estudiante.
- `tblh_fotografias_monitoreo`: fotografías asociadas al monitoreo.
- `tblh_registros_monitoreo`: lecturas del sensor.
- `tblh_bitacoras_diarias`: observaciones diarias del proyecto.

## Reglas del esquema

- Cada tabla incluye identificador, auditoria de fecha y estado lógico.
- `estado = 1` indica activo y `estado = 0` inactivo.
- La tabla `tblh_usuarios` exige unicidad por documento y por nombre de usuario.
- El campo `password_hash` debe guardar un hash generado por el backend, nunca una contraseña en texto plano.
- Los dispositivos y proyectos están relacionados para mantener un flujo de monitoreo ordenado.

## Consideraciones importantes

- El archivo de variables de entorno no debe subirse al repositorio. Se usa `src/backend/.env` para la conexión local.
- No deben quedar credenciales reales ni usuarios de producción en scripts SQL.
- La configuración de usuarios y permisos de base de datos debe manejarse de forma segura y por entorno.

## Ejecución recomendada

Desde una terminal con MariaDB disponible:

```bash
mariadb -u root -p
```

Luego, dentro del cliente SQL:

```sql
SOURCE db/rural40_schema.sql;
```

O directamente desde consola:

```bash
mariadb -u USUARIO -p < db/rural40_schema.sql
```

## Nota

Si después necesitas agregar datos iniciales para pruebas o un usuario demostrativo, conviene hacerlo en un script separado y mantenerlo fuera del repositorio principal o bajo condiciones controladas de entorno.