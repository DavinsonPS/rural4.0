const auditoriaRepo = require('../repositories/auditoria.repo');

// Registra acciones de gestión hechas por un usuario (no por herramientas internas).
function audit(actor, accion, entidad, idEntidad, detalle = null) {
	if (!actor?.id) return Promise.resolve();
	return auditoriaRepo.record({ idUsuario: actor.id, accion, entidad, idEntidad, detalle });
}

module.exports = { audit };
