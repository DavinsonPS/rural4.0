const assert = require('node:assert/strict');
const test = require('node:test');
const { users, stubSessionUsers, startApp } = require('./helpers');

const proyectosRepo = require('../repositories/proyectos.repo');
const lecturasRepo = require('../repositories/lecturas.repo');
const bitacorasRepo = require('../repositories/bitacoras.repo');
const dispositivosRepo = require('../repositories/dispositivos.repo');
const auditoriaRepo = require('../repositories/auditoria.repo');

const project = { id: 4, nombre: 'Huerta', id_usuario: users.estudiante.id, id_docente: users.docente.id, id_planta: 1, id_dispositivo: null, id_dispositivo_camara: null, fecha_fin: null, id_institucion: 1 };
const descendingReadings = [
	{ temperatura_c: 24, humedad_ambiente_pct: 60, humedad_suelo_pct: 48, intensidad_luz_lux: 180, fecha_lectura: '2026-09-26T10:10:00.000Z' },
	{ temperatura_c: 23, humedad_ambiente_pct: 61, humedad_suelo_pct: 42, intensidad_luz_lux: 120, fecha_lectura: '2026-09-26T10:05:00.000Z' },
];

let app;
let writes = [];

test.before(async () => {
	stubSessionUsers();
	proyectosRepo.findActiveById = async (id) => (Number(id) === project.id ? { ...project } : null);
	proyectosRepo.setEndDate = async (id, finalize) => { writes.push(['setEndDate', id, finalize]); return true; };
	lecturasRepo.listRecent = async () => descendingReadings.map((reading) => ({ ...reading }));
	bitacorasRepo.upsertForDate = async (...args) => { writes.push(['upsert', ...args]); };
	auditoriaRepo.record = async (entry) => { writes.push(['audit', entry.accion]); };
	dispositivosRepo.lockProjectSlots = async () => { throw new Error('no debería llegar a la BD'); };
	app = await startApp([
		['/api/proyectos', require('../routes/projects.routes')],
		['/api/monitoreo', require('../routes/monitoring.routes')],
		['/api/dispositivos', require('../routes/devices.routes')],
		['/api/docente', require('../routes/docente.routes')],
	]);
});

test.beforeEach(() => { writes = []; });
test.after(() => app.close());

test('sin sesión la API responde 401', async () => {
	const response = await app.request('/api/proyectos/resumen/4/lecturas');
	assert.equal(response.status, 401);
});

test('otro estudiante no obtiene lecturas ajenas aunque mande usuario_id del dueño', async () => {
	const response = await app.request(`/api/proyectos/resumen/4/lecturas?usuario_id=${users.estudiante.id}`, { user: users.otroEstudiante });
	assert.equal(response.status, 404);
});

test('el dueño recibe las lecturas en orden cronológico', async () => {
	const response = await app.request('/api/proyectos/resumen/4/lecturas', { user: users.estudiante });
	assert.equal(response.status, 200);
	const readings = await response.json();
	assert.equal(readings.length, 2);
	assert.equal(readings[0].fecha_lectura, '2026-09-26T10:05:00.000Z');
	assert.equal(readings[1].fecha_lectura, '2026-09-26T10:10:00.000Z');
});

test('el docente asignado ve las lecturas; otro docente no', async () => {
	assert.equal((await app.request('/api/proyectos/resumen/4/lecturas', { user: users.docente })).status, 200);
	assert.equal((await app.request('/api/proyectos/resumen/4/lecturas', { user: users.otroDocente })).status, 404);
});

test('el docente no puede escribir bitácoras del estudiante', async () => {
	const response = await app.request('/api/monitoreo/bitacoras', {
		user: users.docente,
		method: 'POST',
		body: { id_proyecto: 4, fecha_bitacora: '2026-09-27', observacion: 'Hola' },
	});
	assert.equal(response.status, 403);
	assert.equal(writes.length, 0);
});

test('la bitácora se guarda para el usuario de la sesión, ignorando id_usuario del cliente', async () => {
	const response = await app.request('/api/monitoreo/bitacoras', {
		user: users.estudiante,
		method: 'POST',
		body: { id_proyecto: 4, id_usuario: 999, fecha_bitacora: '2026-09-27', observacion: 'Brotó una hoja', retos_completados: ['color'] },
	});
	assert.equal(response.status, 201);
	assert.equal(writes[0][0], 'upsert');
	assert.equal(writes[0][1], 4);
});

test('desvincular dispositivos sin sesión ni clave interna responde 401', async () => {
	const response = await app.request('/api/dispositivos/proyectos/4', { method: 'DELETE' });
	assert.equal(response.status, 401);
});

test('el panel docente rechaza a estudiantes', async () => {
	assert.equal((await app.request('/api/docente/resumen', { user: users.estudiante })).status, 403);
});

test('solo el docente asignado finaliza el proyecto y queda auditado', async () => {
	assert.equal((await app.request('/api/docente/proyectos/4/finalizar', { user: users.otroDocente, method: 'POST' })).status, 404);
	const response = await app.request('/api/docente/proyectos/4/finalizar', { user: users.docente, method: 'POST' });
	assert.equal(response.status, 200);
	assert.deepEqual(writes, [['setEndDate', 4, true], ['audit', 'proyecto.finalizar']]);
});

test('rutas /api inexistentes responden 404 en JSON', async () => {
	const response = await app.request('/api/no-existe', { user: users.estudiante });
	assert.equal(response.status, 404);
	assert.match((await response.json()).error, /no encontrada/);
});
