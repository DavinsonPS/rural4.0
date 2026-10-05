const { pool } = require('../db');

let tableMissingWarned = false;

// La auditoría es de mejor esfuerzo: si la tabla aún no se importó en Plesk
// (migración 002) o falla la escritura, la acción principal no se interrumpe.
async function record({ idUsuario, accion, entidad, idEntidad, detalle = null }) {
	try {
		await pool.query(
			`INSERT INTO tblh_auditoria (id_usuario, accion, entidad, id_entidad, detalle)
			 VALUES (?, ?, ?, ?, ?)`,
			[idUsuario, accion, entidad, idEntidad, detalle ? JSON.stringify(detalle) : null],
		);
	} catch (error) {
		if (error.code === 'ER_NO_SUCH_TABLE') {
			if (!tableMissingWarned) console.warn('Auditoría desactivada: falta importar migraciones/002_auditoria.sql.');
			tableMissingWarned = true;
			return;
		}
		console.error('Audit record failed:', error.message);
	}
}

module.exports = { record };
