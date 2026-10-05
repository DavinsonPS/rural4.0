// Entorno de prueba: sin base de datos real. Cada test reemplaza las funciones de los
// repositorios que necesita; cualquier consulta no simulada falla de forma explícita.
const http = require('node:http');

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'secreto-de-prueba';
process.env.DEVICE_REGISTRATION_KEY = 'clave-registro-prueba';

const databasePath = require.resolve('../db');
require.cache[databasePath] = {
	id: databasePath,
	filename: databasePath,
	loaded: true,
	exports: {
		pool: {
			async query(sql) {
				throw new Error(`Consulta no simulada en el test: ${String(sql).slice(0, 80)}`);
			},
			async getConnection() {
				throw new Error('Conexión no simulada en el test.');
			},
		},
	},
};

const express = require('express');
const { createSessionToken, cookieName } = require('../session');
const { apiNotFound, errorHandler } = require('../middlewares/error-handler');

const users = {
	estudiante: { id: 17, rol: 'ESTUDIANTE', nombres: 'Ana', apellidos: 'Gómez', id_institucion: 1 },
	otroEstudiante: { id: 18, rol: 'ESTUDIANTE', nombres: 'Luis', apellidos: 'Pérez', id_institucion: 1 },
	docente: { id: 2, rol: 'DOCENTE', nombres: 'María', apellidos: 'Ruiz', id_institucion: 1 },
	otroDocente: { id: 3, rol: 'DOCENTE', nombres: 'Pedro', apellidos: 'Díaz', id_institucion: 1 },
	admin: { id: 1, rol: 'ADMINISTRADOR', nombres: 'Admin', apellidos: 'Rural', id_institucion: 1 },
};

// Hace que el middleware de sesión encuentre al usuario sin ir a la BD.
function stubSessionUsers() {
	const usuariosRepo = require('../repositories/usuarios.repo');
	usuariosRepo.findActiveSessionUser = async (id) => Object.values(users).find((user) => user.id === Number(id)) || null;
}

function cookieFor(user) {
	return `${cookieName}=${createSessionToken(user)}`;
}

async function startApp(mounts) {
	const app = express();
	app.use(express.json());
	mounts.forEach(([mountPath, router]) => app.use(mountPath, router));
	app.use('/api', apiNotFound);
	app.use(errorHandler);
	const server = http.createServer(app);
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const baseUrl = `http://127.0.0.1:${server.address().port}`;
	return {
		baseUrl,
		request: (path, { user, method = 'GET', body, headers = {} } = {}) => fetch(`${baseUrl}${path}`, {
			method,
			headers: {
				...(user ? { cookie: cookieFor(user) } : {}),
				...(body ? { 'content-type': 'application/json' } : {}),
				...headers,
			},
			body: body ? JSON.stringify(body) : undefined,
		}),
		close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
	};
}

module.exports = { users, stubSessionUsers, cookieFor, startApp };
