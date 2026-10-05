const assert = require('node:assert/strict');
const test = require('node:test');
const { users, stubSessionUsers, startApp } = require('./helpers');
const repo = require('../repositories/admin.repo');
const auditoriaRepo = require('../repositories/auditoria.repo');
const correo = require('../services/correo.service');
const adminService = require('../services/admin.service');

const admin = users.admin;
const baseUser = { id: 40, nombres: 'Rosa', apellidos: 'López', usuario: 'rlopez', correo: 'rosa@colegio.co', estado: 1, ultimo_acceso: null, proyectos_como_docente: 0, proyectos_como_estudiante: 0, id_institucion: 1 };
let stored;

test.beforeEach(() => {
	stored = { ...baseUser, rol: 'DOCENTE' };
	repo.findUser = async (id) => (Number(id) === stored.id ? { ...stored } : Number(id) === admin.id ? { ...baseUser, id: admin.id, rol: 'ADMINISTRADOR' } : null);
	repo.countActiveAdmins = async () => 1;
	repo.findRole = async (name) => ({ id: { ESTUDIANTE: 1, DOCENTE: 2, ADMINISTRADOR: 3 }[name], nombre: name });
	repo.setUserRole = async (id, roleId) => { stored.rol = { 1: 'ESTUDIANTE', 2: 'DOCENTE', 3: 'ADMINISTRADOR' }[roleId]; };
	repo.setUserActive = async (id, active) => { stored.estado = active ? 1 : 0; };
	repo.replaceAccessToken = async () => {};
	repo.institutionExists = async () => true;
	repo.findConflict = async () => null;
	repo.insertUser = async () => 77;
	auditoriaRepo.record = async () => {};
});

test('el administrador no puede desactivarse ni cambiarse el rol a sí mismo', async () => {
	await assert.rejects(adminService.setUserActive(admin, admin.id, false), { status: 409 });
	await assert.rejects(adminService.changeRole(admin, admin.id, 'DOCENTE'), { status: 409 });
});

test('siempre queda al menos un administrador activo', async () => {
	stored.rol = 'ADMINISTRADOR';
	await assert.rejects(adminService.setUserActive(admin, stored.id, false), { message: /al menos un administrador/ });
	await assert.rejects(adminService.changeRole(admin, stored.id, 'DOCENTE'), { message: /al menos un administrador/ });
	repo.countActiveAdmins = async () => 2;
	assert.equal((await adminService.changeRole(admin, stored.id, 'DOCENTE')).rol, 'DOCENTE');
});

test('no cambia el rol de un docente con proyectos a cargo', async () => {
	stored.proyectos_como_docente = 3;
	await assert.rejects(adminService.changeRole(admin, stored.id, 'ESTUDIANTE'), { message: /Reasígnalos/ });
});

test('desactivar un docente con proyectos avisa que quedaron sin docente', async () => {
	stored.proyectos_como_docente = 2;
	const result = await adminService.setUserActive(admin, stored.id, false);
	assert.equal(result.activo, false);
	assert.match(result.aviso, /2 proyecto/);
});

test('desde administración solo se crean docentes y administradores', async () => {
	const body = { rol: 'ESTUDIANTE', id_tipo_documento: 1, numero_documento: '1', nombres: 'A', apellidos: 'B', correo: 'a@b.co', id_institucion: 1, usuario: 'abc' };
	await assert.rejects(adminService.createUser(admin, body), { status: 400 });
});

test('si el correo de invitación falla, devuelve el enlace para compartirlo', async () => {
	const original = correo.sendInvitationEmail;
	correo.sendInvitationEmail = async () => { throw new Error('SMTP caído'); };
	try {
		const result = await adminService.createUser(admin, { rol: 'DOCENTE', id_tipo_documento: 1, numero_documento: '99', nombres: 'Rosa', apellidos: 'López', correo: 'rosa@colegio.co', id_institucion: 1, usuario: 'rlopez' });
		assert.equal(result.id, 77);
		assert.equal(result.invitacion.enviada, false);
		assert.match(result.invitacion.enlace, /restablecer\.html\?token=[a-f0-9]{64}&invitacion=1/);
	} finally {
		correo.sendInvitationEmail = original;
	}
});

test('la API de administración rechaza a docentes y estudiantes', async () => {
	stubSessionUsers();
	const app = await startApp([['/api/admin', require('../routes/admin.routes')]]);
	try {
		assert.equal((await app.request('/api/admin/usuarios', { user: users.docente })).status, 403);
		assert.equal((await app.request('/api/admin/usuarios', { user: users.estudiante })).status, 403);
		assert.equal((await app.request('/api/admin/usuarios')).status, 401);
	} finally {
		await app.close();
	}
});
