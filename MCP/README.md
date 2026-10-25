# rural4.0 MCP

Servidor MCP por HTTP para consultar de forma estructurada los proyectos, sensores,
bitácoras y progreso de aprendizaje de rural4.0. Las tools existentes devuelven JSON
dentro de `content[0].text`, e incluyen descripciones en español para orientar al
agente sobre cuándo usarlas.

## Ejecución

En rural4.0, MCP y la página comparten el backend y el puerto configurado en `PORT`.
El servidor web inicia sin esperar a la base de datos; mientras MCP no esté listo,
sus solicitudes reciben 503 y el backend vuelve a comprobar la conexión cada
30 segundos. Al quedar listo MCP, el backend inicializa Guardián. El endpoint MCP
está en `http://localhost:3000/mcp`; usa la cookie de sesión autenticada de
estudiante o docente. No hace falta arrancar un proceso MCP separado para usarlo
con la aplicación.

La ejecución independiente descrita abajo se conserva para desarrollo y pruebas del MCP:
Requiere Node.js 18 o superior y una conexión a MySQL. Instala dependencias con
`npm install`, configura las variables del `.env.example` en `.env` y ejecuta:

```powershell
npm start
```

El servidor expone `POST`, `GET` y `DELETE /mcp`, además de `GET /healthz`.
Por defecto escucha solo en `127.0.0.1:3000`. Si el hosting asigna un puerto en
la variable `PORT`, se usa ese puerto antes que `MCP_PORT`. Configura
`MCP_HOST=0.0.0.0` solo cuando el hosting o su proxy inverso necesite alcanzar
el proceso por una interfaz de red; limita el acceso con el firewall o proxy
del servidor.

Si MySQL productivo solo es accesible mediante SSH, establece el túnel SSH fuera
del MCP y configura `DB_HOST`/`DB_PORT` hacia su extremo local. El servidor no
abre ni administra túneles SSH.

## Probar con MCP Inspector

Abre dos terminales de PowerShell en la carpeta del proyecto.

En la primera, arranca el servidor:

```powershell
Set-Location 'C:\Users\USUARIO\Documents\Repositorios\MCP'
npm start
```

Confirma que aparezca el mensaje de que escucha en `127.0.0.1:3000/mcp`. Si
MySQL requiere el túnel SSH, este debe estar conectado antes de iniciar el
servidor.

En la segunda terminal, abre el Inspector:

```powershell
Set-Location 'C:\Users\USUARIO\Documents\Repositorios\MCP'
npx @modelcontextprotocol/inspector
```

Abre la URL local que imprime Inspector. En la configuración de conexión,
selecciona **Streamable HTTP** y usa `http://127.0.0.1:3000/mcp`. Agrega estos
encabezados HTTP para simular al backend autenticado:

| Encabezado | Valor |
| --- | --- |
| `Authorization` | `Bearer ` seguido del valor de `MCP_SERVICE_TOKEN` de `.env` |
| `X-Rural40-Actor-Id` | ID de una cuenta de prueba activa en la base |
| `X-Rural40-Actor-Role` | `ESTUDIANTE` o `DOCENTE`, según el rol de esa cuenta |

Pulsa **Connect** y después abre **Tools**. Primero prueba `get_my_profile` o
`list_my_projects`; para las tools de proyecto, copia un `project_id` que
devuelva `list_my_projects`. El rol debe coincidir con el de la cuenta en la
base. Un `401` suele indicar token incorrecto; un `403`, que el usuario está
inactivo o que el rol no coincide; un `503` puede indicar un problema de
conexión a MySQL.

La autenticación por encabezados en Inspector es solo para una prueba local
controlada: representa los encabezados que debe inyectar el backend de
confianza. No expongas Inspector ni el MCP a Internet, no compartas capturas con
el token y usa una cuenta de prueba. Los comandos `npm test` siguen siendo la
opción sin conexión a la base.

## Identidad y acceso

El backend debe autenticar al usuario, sobrescribir las cabeceras de identidad y
llamar al MCP con:

- Token de servicio en el encabezado HTTP Bearer, usando el valor de `MCP_SERVICE_TOKEN`.
- `X-Rural40-Actor-Id: <id verificado>`
- `X-Rural40-Actor-Role: ESTUDIANTE|DOCENTE`

No aceptes esas cabeceras directamente de un cliente público ni permitas que el
agente las elija. El servidor valida el token, fija la identidad al crear la
sesión MCP y rechaza solicitudes posteriores que intenten cambiarla. También
vuelve a comprobar en la base de datos que el usuario siga activo y tenga el rol
declarado antes de cada tool. Los argumentos del modelo no contienen `actor_id`
ni `actor_role`; los proyectos se vuelven a autorizar para ese usuario.

Usa un usuario MySQL dedicado con permisos `SELECT` únicamente sobre las tablas
requeridas. Las tools actuales solo ejecutan consultas de lectura, pero los
permisos de la base de datos son la última barrera contra modificaciones.
Mantén `.env` y el token fuera del control de versiones; rota el token si se
expone.

## Tools disponibles

| Tool | Cuándo usarla | Argumentos |
| --- | --- | --- |
| `get_my_profile` | Nombre, rol e institución del usuario autenticado. | Ninguno |
| `list_my_projects` | Enumerar proyectos activos visibles para el usuario. | Ninguno |
| `get_project_overview` | Datos del proyecto, planta, rangos y última lectura. | `project_id` |
| `get_sensor_trends` | Promedios diarios de sensores. | `project_id`, `days` opcional (1–7) |
| `get_care_logs` | Bitácoras de cuidado y riego recientes. | `project_id`, `days` opcional (1–7) |
| `get_care_alerts` | Alertas calculadas a partir de lecturas y bitácoras. | `project_id` |
| `get_learning_context` | Resultados de aprendizaje por tema. | `project_id` |

Los arreglos vacíos significan que no hay registros en el periodo consultado.
Una lectura `null` significa que no hay un valor disponible; el agente no debe
inventarlo. No se deben presentar las alertas como diagnóstico agronómico.

## Pruebas

Ejecuta `npm test`. Las pruebas son locales y no abren conexión a la base de
datos productiva.
