# Guardián

Agente educativo **Guardián**. Su implementación vive en `AGENTE/`; el backend
principal lo carga junto al MCP y a la página, sin abrir otro proceso ni otro
puerto.

## Requisitos y configuración

Usa Node.js 20 o superior. Lee `OPENAI_API_KEY`, `MODELO`, `SESSION_SECRET` y las
variables de base de datos desde `src/backend/.env`; no copies secretos a esta
carpeta. Instala las dependencias del backend y arranca toda la aplicación desde
`src/backend`:

```powershell
Set-Location src/backend
npm install
npm start
```

El backend inicia el sitio sin esperar a la base de datos. Primero valida MCP y
después inicializa Guardián; mientras cada servicio no esté listo, sus rutas
responden 503 y se reintenta la inicialización cada 30 segundos. El estado se
puede consultar en `/api/health`.

Guardián usa la instancia de Express y las dependencias del backend principal;
no instales ni ejecutes un servidor independiente desde `AGENTE/`.

## API

Todas las rutas requieren la cookie de sesión vigente de rural4.0 y el rol
**ESTUDIANTE**. Si se llama desde Postman, inicia sesión primero y envía la cookie
`rural40_session` que responde `/api/auth/login`.

- `GET /api/guardian/conversaciones?project_id=ID` lista las conversaciones del proyecto indicado. `project_id` es obligatorio y debe pertenecer al estudiante autenticado.
- `GET /api/guardian/conversaciones/ID` devuelve los mensajes de una conversación propia.
- `POST /api/guardian/chat` envía un mensaje:

```json
{
  "message": "¿Cómo han cambiado los datos de mi planta?",
  "project_id": 12,
  "conversation_id": null
}
```

En la primera respuesta se recibe el `conversation_id`; envíalo en los mensajes
siguientes para continuar el mismo chat. `project_id` es obligatorio incluso
para preguntas generales y debe ser un proyecto activo del estudiante
autenticado. Si aún no tiene un proyecto, debe crear uno antes de iniciar una
conversación. El servidor verifica la propiedad antes de llamar a OpenAI o
guardar mensajes.

## Memoria y herramientas

Guardián guarda mensajes y conversaciones en
`tblh_guardian_mensajes` y `tblh_guardian_conversaciones`. En cada respuesta
incluye los últimos 12 mensajes de la conversación como memoria de corto plazo y
recupera hasta tres conversaciones anteriores del mismo proyecto como contexto
de largo plazo. Si el esquema define los valores de `rol` como `ESTUDIANTE` y
`GUARDIÁN`, los reconoce al leer el enum; también reconoce las variantes comunes
`user`/`assistant`.

Para datos actuales del proyecto, el agente usa las herramientas MCP registradas
en `MCP/tools.js` a través del SDK MCP en memoria. Las verificaciones de actor y
de acceso por proyecto se vuelven a ejecutar antes de las consultas. Las
herramientas son de solo lectura.

El widget visual de Guardián consume estas rutas en el mismo dominio de la
página y usa su cookie de sesión. No hay un segundo servidor ni un proxy
adicional.

## Pruebas

Las pruebas unitarias del agente se pueden ejecutar desde `AGENTE/`:

```powershell
npm test
```
