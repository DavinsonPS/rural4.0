const proyectosRepo = require('../repositories/proyectos.repo');
const usuariosRepo = require('../repositories/usuarios.repo');
const catalogosRepo = require('../repositories/catalogos.repo');
const lecturasService = require('./lecturas.service');
const { audit } = require('./auditoria.service');
const { assertCan } = require('../policies/proyectos.policy');
const { ROLES } = require('../config/catalogos');
const { ValidationError, NotFoundError, ConflictError } = require('../lib/errors');
const { positiveInteger, text } = require('../lib/http');
const { toColombiaDate } = require('../lib/fechas');

function hasDevices(project) {
	return Boolean(project.id_dispositivo || project.id_dispositivo_camara);
}

// Carga un proyecto activo y verifica que el actor pueda hacer `action` sobre él.
async function loadFor(actor, projectId, action = 'view') {
	const id = positiveInteger(projectId);
	if (!id) throw new ValidationError('Identificador de proyecto inválido.');
	const project = await proyectosRepo.findActiveById(id);
	assertCan(action, actor, project);
	return project;
}

// Un proyecto solo puede asignarse a un docente de la misma institución que el estudiante.
async function assertTeacher(teacherId, institutionId) {
	const teacher = await usuariosRepo.findTeacher(teacherId, institutionId ?? null);
	if (!teacher) throw new ValidationError('El docente seleccionado no es válido para esta institución.');
	return teacher;
}

async function assertPlant(plantId) {
	if (!await catalogosRepo.findActivePlant(plantId)) throw new NotFoundError('La planta no existe o está inactiva.');
}

function readProjectFields(data) {
	return {
		nombre: text(data?.nombre).slice(0, 150),
		descripcion: text(data?.descripcion) || null,
		idDocente: positiveInteger(data?.id_docente),
		idPlanta: positiveInteger(data?.id_planta),
	};
}

async function listForStudent(user) {
	return proyectosRepo.listByStudent(user.id);
}

async function create(user, data) {
	const fields = readProjectFields(data);
	if (!fields.idDocente || !fields.idPlanta || !fields.nombre) {
		throw new ValidationError('Usuario, docente, planta y nombre del proyecto son obligatorios.');
	}
	await assertTeacher(fields.idDocente, user.id_institucion);
	await assertPlant(fields.idPlanta);
	const startDate = /^\d{4}-\d{2}-\d{2}$/.test(text(data?.fecha_inicio)) ? text(data.fecha_inicio) : toColombiaDate();
	try {
		const id = await proyectosRepo.create({ ...fields, idUsuario: user.id, fechaInicio: startDate });
		return { id, nombre: fields.nombre, id_usuario: user.id, id_docente: fields.idDocente, id_planta: fields.idPlanta };
	} catch (error) {
		if (error.code === 'ER_DUP_ENTRY') throw new ConflictError('El proyecto o el dispositivo seleccionado ya existe.');
		throw error;
	}
}

// Nombre y descripción se pueden editar siempre; la planta no, si hay dispositivos
// vinculados, porque cambiaría el significado de los datos ya recogidos.
async function update(actor, projectId, data) {
	const project = await loadFor(actor, projectId, 'manage');
	const fields = readProjectFields(data);
	if (!fields.nombre) throw new ValidationError('Proyecto, docente, planta y nombre son obligatorios.');
	const plantId = fields.idPlanta || project.id_planta;
	const teacherId = fields.idDocente || project.id_docente;
	if (Number(plantId) !== Number(project.id_planta)) {
		if (hasDevices(project)) throw new ConflictError('No puedes cambiar la planta de un proyecto con dispositivos vinculados.');
		await assertPlant(plantId);
	}
	if (Number(teacherId) !== Number(project.id_docente)) await assertTeacher(teacherId, project.id_institucion);
	await proyectosRepo.updateInfo(project.id, { nombre: fields.nombre, descripcion: fields.descripcion, idDocente: teacherId, idPlanta: plantId });
	if (actor.rol !== ROLES.ESTUDIANTE) {
		await audit(actor, 'proyecto.editar', 'proyecto', project.id, { nombre: fields.nombre, id_planta: plantId, id_docente: teacherId });
	}
	return { id: project.id, nombre: fields.nombre };
}

async function archive(actor, projectId) {
	const project = await loadFor(actor, projectId, 'manage');
	if (hasDevices(project)) throw new ConflictError('No puedes eliminar un proyecto con dispositivos vinculados.');
	await proyectosRepo.archive(project.id);
	await audit(actor, 'proyecto.archivar', 'proyecto', project.id);
	return { message: 'Proyecto eliminado correctamente.' };
}

function formatSummary(project, latestReading) {
	return {
		project: {
			id: project.id,
			id_usuario: project.id_usuario,
			id_docente: project.id_docente,
			nombre: project.nombre,
			descripcion: project.descripcion,
			id_planta: project.id_planta,
			planta: project.planta,
			id_dispositivo: project.id_dispositivo,
			id_dispositivo_camara: project.id_dispositivo_camara,
			dispositivo_camara: project.id_dispositivo_camara ? {
				id: project.id_dispositivo_camara,
				codigo_interno: project.camera_codigo_interno,
				mac_address: project.camera_mac_address,
				modelo: project.camera_modelo,
				fecha_ultimo_contacto: project.camera_fecha_ultimo_contacto,
			} : null,
			codigo_interno: project.codigo_interno,
			mac_address: project.mac_address,
			modelo: project.modelo,
			fecha_ultimo_contacto: project.fecha_ultimo_contacto,
			configuracion_led: project.configuracion_led,
			color_led: project.color_led,
			brillo_led: project.brillo_led,
			tipo_tierra: project.tipo_tierra,
			fecha_inicio: project.fecha_inicio,
			fecha_fin: project.fecha_fin,
			finalizado: Boolean(project.fecha_fin),
			usuario: {
				nombres: project.usuario_nombres,
				apellidos: project.usuario_apellidos,
				usuario: project.usuario_usuario,
			},
			docente: project.id_docente ? {
				nombres: project.docente_nombres,
				apellidos: project.docente_apellidos,
			} : null,
			institucion: project.institucion_nombre || null,
		},
		ultima_lectura: latestReading || null,
	};
}

async function summary(actor, projectId) {
	const project = await loadFor(actor, projectId, 'view');
	const [details, latestReading] = await Promise.all([
		proyectosRepo.findSummaryById(project.id),
		lecturasService.latest(project.id),
	]);
	if (!details) throw new NotFoundError('Proyecto no encontrado.');
	return formatSummary(details, latestReading);
}

async function readingsHistory(actor, projectId) {
	const project = await loadFor(actor, projectId, 'view');
	return lecturasService.history(project.id);
}

async function listTeachersForUser(user) {
	return usuariosRepo.listTeachers(user.rol === ROLES.ADMINISTRADOR ? null : user.id_institucion);
}

async function listTeachersForProject(actor, projectId) {
	const project = await loadFor(actor, projectId, 'supervise');
	return usuariosRepo.listTeachers(project.id_institucion);
}

async function setFinalized(actor, projectId, finalize) {
	const project = await loadFor(actor, projectId, 'supervise');
	const changed = await proyectosRepo.setEndDate(project.id, finalize);
	if (!changed) throw new ConflictError(finalize ? 'El proyecto ya está finalizado.' : 'El proyecto no está finalizado.');
	await audit(actor, finalize ? 'proyecto.finalizar' : 'proyecto.reabrir', 'proyecto', project.id);
	return { id: project.id, finalizado: finalize };
}

async function reassignTeacher(actor, projectId, teacherIdValue) {
	const project = await loadFor(actor, projectId, 'supervise');
	const teacherId = positiveInteger(teacherIdValue);
	if (!teacherId) throw new ValidationError('Selecciona el docente al que se reasigna el proyecto.');
	if (teacherId === Number(project.id_docente)) throw new ConflictError('El proyecto ya está asignado a ese docente.');
	const teacher = await assertTeacher(teacherId, project.id_institucion);
	await proyectosRepo.setTeacher(project.id, teacherId);
	await audit(actor, 'proyecto.reasignar', 'proyecto', project.id, { de: project.id_docente, a: teacherId });
	return { id: project.id, id_docente: teacherId, docente: `${teacher.nombres} ${teacher.apellidos}` };
}

module.exports = {
	loadFor,
	listForStudent,
	create,
	update,
	archive,
	summary,
	readingsHistory,
	listTeachersForUser,
	listTeachersForProject,
	setFinalized,
	reassignTeacher,
};
