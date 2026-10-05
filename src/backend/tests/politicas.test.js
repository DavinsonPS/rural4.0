const assert = require('node:assert/strict');
const test = require('node:test');
const { users } = require('./helpers');
const { canView, canManage, canSupervise, canRecord, assertCan } = require('../policies/proyectos.policy');

const project = { id: 4, id_usuario: users.estudiante.id, id_docente: users.docente.id, fecha_fin: null };
const finalized = { ...project, fecha_fin: '2026-09-30' };
const internal = { internal: true };

test('estudiante dueño: ve, gestiona y registra; no supervisa', () => {
	assert.equal(canView(users.estudiante, project), true);
	assert.equal(canManage(users.estudiante, project), true);
	assert.equal(canRecord(users.estudiante, project), true);
	assert.equal(canSupervise(users.estudiante, project), false);
});

test('estudiante dueño con proyecto finalizado: solo consulta', () => {
	assert.equal(canView(users.estudiante, finalized), true);
	assert.equal(canManage(users.estudiante, finalized), false);
	assert.equal(canRecord(users.estudiante, finalized), false);
	assert.throws(() => assertCan('record', users.estudiante, finalized), { status: 403, message: /finalizado/ });
});

test('otro estudiante no ve el proyecto y recibe 404', () => {
	assert.equal(canView(users.otroEstudiante, project), false);
	assert.throws(() => assertCan('view', users.otroEstudiante, project), { status: 404 });
});

test('docente asignado: ve, gestiona y supervisa, pero no registra bitácoras', () => {
	assert.equal(canView(users.docente, project), true);
	assert.equal(canManage(users.docente, project), true);
	assert.equal(canSupervise(users.docente, project), true);
	assert.equal(canRecord(users.docente, project), false);
	assert.equal(canManage(users.docente, finalized), true);
	assert.throws(() => assertCan('record', users.docente, project), { status: 403 });
});

test('docente no asignado no ve el proyecto', () => {
	assert.equal(canView(users.otroDocente, project), false);
	assert.throws(() => assertCan('manage', users.otroDocente, project), { status: 404 });
});

test('administrador ve y supervisa todo, pero no registra por el estudiante', () => {
	assert.equal(canView(users.admin, project), true);
	assert.equal(canSupervise(users.admin, project), true);
	assert.equal(canRecord(users.admin, project), false);
});

test('clave interna gestiona dispositivos pero no supervisa ni registra', () => {
	assert.equal(canManage(internal, project), true);
	assert.equal(canSupervise(internal, project), false);
	assert.equal(canRecord(internal, project), false);
});

test('sin proyecto o sin actor siempre 404', () => {
	assert.throws(() => assertCan('view', users.estudiante, null), { status: 404 });
	assert.equal(canView(null, project), false);
});
