const { pool } = require('../db');

async function findActiveSessionUser(userId) {
	const [rows] = await pool.query(
		`SELECT u.id, u.nombres, u.apellidos, u.usuario, u.correo, u.id_institucion,
			UPPER(r.nombre) AS rol, i.nombre AS institucion
		 FROM tblh_usuarios u
		 INNER JOIN tbld_roles r ON r.id = u.id_rol AND r.estado = 1
		 LEFT JOIN tbld_instituciones i ON i.id = u.id_institucion
		 WHERE u.id = ? AND u.estado = 1
		 LIMIT 1`,
		[userId],
	);
	return rows[0] || null;
}

async function findTeacher(teacherId, institutionId = null) {
	const [rows] = await pool.query(
		`SELECT u.id, u.nombres, u.apellidos, u.id_institucion
		 FROM tblh_usuarios u
		 JOIN tbld_roles r ON r.id = u.id_rol
		 WHERE u.id = ? AND u.estado = 1 AND r.nombre = 'DOCENTE'
			AND (? IS NULL OR u.id_institucion = ?)
		 LIMIT 1`,
		[teacherId, institutionId, institutionId],
	);
	return rows[0] || null;
}

async function listTeachers(institutionId = null) {
	const [rows] = await pool.query(
		`SELECT u.id, u.nombres, u.apellidos, u.correo, u.usuario
		 FROM tblh_usuarios u
		 JOIN tbld_roles r ON r.id = u.id_rol
		 WHERE u.estado = 1 AND r.nombre = 'DOCENTE'
			AND (? IS NULL OR u.id_institucion = ?)
		 ORDER BY u.apellidos ASC, u.nombres ASC`,
		[institutionId, institutionId],
	);
	return rows;
}

module.exports = { findActiveSessionUser, findTeacher, listTeachers };
