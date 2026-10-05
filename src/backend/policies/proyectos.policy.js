const { ROLES } = require('../config/catalogos');
const { ForbiddenError, NotFoundError } = require('../lib/errors');

// Reglas de acceso a un proyecto. `actor` es req.user ({ id, rol }) o
// { internal: true } cuando la petición trae la clave interna de registro.
// Regla de producto: el docente gestiona la estructura del proyecto; el estudiante
// es dueño de lo que registra (bitácoras y fotos).

function isFinalized(project) {
	return Boolean(project?.fecha_fin);
}

function isOwner(actor, project) {
	return actor?.rol === ROLES.ESTUDIANTE && Number(project.id_usuario) === Number(actor.id);
}

function isAssignedTeacher(actor, project) {
	return actor?.rol === ROLES.DOCENTE && Number(project.id_docente) === Number(actor.id);
}

function isAdmin(actor) {
	return actor?.rol === ROLES.ADMINISTRADOR;
}

function canView(actor, project) {
	if (!actor || !project) return false;
	return Boolean(actor.internal) || isAdmin(actor) || isOwner(actor, project) || isAssignedTeacher(actor, project);
}

// Editar datos, configurar LED, vincular/desvincular dispositivos y archivar.
function canManage(actor, project) {
	if (!canView(actor, project)) return false;
	if (actor.internal || isAdmin(actor) || isAssignedTeacher(actor, project)) return true;
	return isOwner(actor, project) && !isFinalized(project);
}

// Acciones exclusivas del acompañamiento docente: finalizar, reabrir, reasignar, ocultar fotos.
function canSupervise(actor, project) {
	if (!actor || !project || actor.internal) return false;
	return isAdmin(actor) || isAssignedTeacher(actor, project);
}

// Registrar bitácoras y subir fotos desde la web: solo el estudiante dueño, y no si está finalizado.
function canRecord(actor, project) {
	return Boolean(actor && project) && isOwner(actor, project) && !isFinalized(project);
}

const denialMessages = {
	manage: 'No tienes permiso para modificar este proyecto.',
	supervise: 'Solo el docente del proyecto puede realizar esta acción.',
	record: 'Solo el estudiante del proyecto puede registrar información.',
};

const checks = { view: canView, manage: canManage, supervise: canSupervise, record: canRecord };

// Si el actor ni siquiera puede ver el proyecto se responde 404, para no revelar que existe.
function assertCan(action, actor, project) {
	if (!project || !canView(actor, project)) throw new NotFoundError('Proyecto no encontrado.');
	if (checks[action](actor, project)) return;
	if (isFinalized(project) && isOwner(actor, project)) throw new ForbiddenError('El proyecto está finalizado. Solo puedes consultarlo.');
	throw new ForbiddenError(denialMessages[action]);
}

module.exports = { isFinalized, canView, canManage, canSupervise, canRecord, assertCan };
