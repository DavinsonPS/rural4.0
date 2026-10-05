const { pool } = require('../db');

// SQL del módulo de administración. Las fechas se devuelven como texto en hora de la BD.

// --- Resumen ---

async function overview() {
	const [rows] = await pool.query(
		`SELECT
			(SELECT COUNT(*) FROM tblh_usuarios u JOIN tbld_roles r ON r.id = u.id_rol WHERE u.estado = 1 AND r.nombre = 'ESTUDIANTE') AS estudiantes,
			(SELECT COUNT(*) FROM tblh_usuarios u JOIN tbld_roles r ON r.id = u.id_rol WHERE u.estado = 1 AND r.nombre = 'DOCENTE') AS docentes,
			(SELECT COUNT(*) FROM tblh_usuarios u JOIN tbld_roles r ON r.id = u.id_rol WHERE u.estado = 1 AND r.nombre = 'ADMINISTRADOR') AS administradores,
			(SELECT COUNT(*) FROM tblh_usuarios WHERE estado = 0) AS usuarios_inactivos,
			(SELECT COUNT(*) FROM tblh_usuarios WHERE ultimo_acceso >= NOW() - INTERVAL 7 DAY) AS usuarios_activos_7d,
			(SELECT COUNT(*) FROM tbld_instituciones WHERE estado = 1) AS instituciones,
			(SELECT COUNT(*) FROM tbld_plantas WHERE estado = 1) AS plantas,
			(SELECT COUNT(*) FROM tblh_proyectos WHERE estado = 1 AND fecha_fin IS NULL) AS proyectos_en_curso,
			(SELECT COUNT(*) FROM tblh_proyectos WHERE estado = 1 AND fecha_fin IS NOT NULL) AS proyectos_finalizados,
			(SELECT COUNT(*) FROM tblh_proyectos WHERE estado = 0) AS proyectos_archivados,
			(SELECT COUNT(*) FROM tbld_dispositivos WHERE estado = 1) AS dispositivos,
			(SELECT COUNT(*) FROM tbld_dispositivos WHERE estado = 1 AND fecha_ultimo_contacto >= NOW() - INTERVAL 30 MINUTE) AS dispositivos_en_linea,
			(SELECT COUNT(*) FROM tbld_dispositivos d WHERE d.estado = 1 AND EXISTS (SELECT 1 FROM tblh_proyectos p WHERE p.estado = 1 AND (p.id_dispositivo = d.id OR p.id_dispositivo_camara = d.id))) AS dispositivos_vinculados,
			(SELECT COUNT(*) FROM tblh_registros_monitoreo WHERE fecha_registro >= NOW() - INTERVAL 1 DAY) AS lecturas_24h,
			(SELECT COUNT(*) FROM tblh_bitacoras_diarias WHERE estado = 1 AND fecha_bitacora >= CURDATE() - INTERVAL 6 DAY) AS bitacoras_7d,
			(SELECT COUNT(*) FROM tblh_fotografias_monitoreo WHERE estado = 1) AS fotos,
			(SELECT COUNT(*) FROM tblh_registros_pendientes WHERE fecha_expiracion > NOW()) AS registros_pendientes`,
	);
	return rows[0];
}

// Las tablas de cuestionarios llegan con la migración 003; si aún no existen se informa en 0.
async function quizOverview() {
	try {
		const [rows] = await pool.query(
			`SELECT (SELECT COUNT(*) FROM tblh_cuestionarios WHERE estado = 1 AND publicado = 1) AS cuestionarios_publicados,
				(SELECT COUNT(*) FROM tblh_intentos) AS intentos`,
		);
		return rows[0];
	} catch (error) {
		if (error.code === 'ER_NO_SUCH_TABLE') return { cuestionarios_publicados: 0, intentos: 0 };
		throw error;
	}
}

// --- Usuarios ---

async function listRoles() {
	const [rows] = await pool.query('SELECT id, nombre, descripcion FROM tbld_roles WHERE estado = 1 ORDER BY id');
	return rows;
}

async function findRole(name) {
	const [rows] = await pool.query('SELECT id, nombre FROM tbld_roles WHERE nombre = ? AND estado = 1 LIMIT 1', [name]);
	return rows[0] || null;
}

const USER_COLUMNS = `u.id, u.id_tipo_documento, td.codigo AS tipo_documento, u.numero_documento, u.nombres, u.apellidos,
	u.correo, u.telefono, u.usuario, u.id_institucion, i.nombre AS institucion, UPPER(r.nombre) AS rol, u.estado,
	DATE_FORMAT(u.ultimo_acceso, '%Y-%m-%d %H:%i') AS ultimo_acceso,
	DATE_FORMAT(u.fecha_registro, '%Y-%m-%d %H:%i') AS fecha_registro,
	(SELECT COUNT(*) FROM tblh_proyectos p WHERE p.estado = 1 AND p.id_usuario = u.id) AS proyectos_como_estudiante,
	(SELECT COUNT(*) FROM tblh_proyectos p WHERE p.estado = 1 AND p.id_docente = u.id) AS proyectos_como_docente`;

async function listUsers({ rol = null, institucion = null, estado = null, q = null }) {
	const search = q ? `%${q}%` : null;
	const [rows] = await pool.query(
		`SELECT ${USER_COLUMNS}
		 FROM tblh_usuarios u
		 JOIN tbld_roles r ON r.id = u.id_rol
		 LEFT JOIN tbld_instituciones i ON i.id = u.id_institucion
		 LEFT JOIN tbld_tipos_documentos td ON td.id = u.id_tipo_documento
		 WHERE (? IS NULL OR r.nombre = ?)
			AND (? IS NULL OR u.id_institucion = ?)
			AND (? IS NULL OR u.estado = ?)
			AND (? IS NULL OR CONCAT_WS(' ', u.nombres, u.apellidos, u.usuario, u.correo, u.numero_documento) LIKE ?)
		 ORDER BY u.estado DESC, r.id DESC, u.apellidos, u.nombres
		 LIMIT 500`,
		[rol, rol, institucion, institucion, estado, estado, search, search],
	);
	return rows;
}

async function findUser(userId) {
	const [rows] = await pool.query(
		`SELECT ${USER_COLUMNS}
		 FROM tblh_usuarios u
		 JOIN tbld_roles r ON r.id = u.id_rol
		 LEFT JOIN tbld_instituciones i ON i.id = u.id_institucion
		 LEFT JOIN tbld_tipos_documentos td ON td.id = u.id_tipo_documento
		 WHERE u.id = ? LIMIT 1`,
		[userId],
	);
	return rows[0] || null;
}

async function findConflict({ usuario, correo, idTipoDocumento, numeroDocumento }, excludeId = 0) {
	const [rows] = await pool.query(
		`SELECT usuario, correo, id_tipo_documento, numero_documento FROM tblh_usuarios
		 WHERE id <> ? AND (usuario = ? OR correo = ? OR (id_tipo_documento = ? AND numero_documento = ?))
		 LIMIT 1`,
		[excludeId, usuario, correo, idTipoDocumento, numeroDocumento],
	);
	return rows[0] || null;
}

async function insertUser(user) {
	const [result] = await pool.query(
		`INSERT INTO tblh_usuarios
		 (id_tipo_documento, numero_documento, nombres, apellidos, correo, telefono, id_rol, id_institucion, usuario, password_hash)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[user.idTipoDocumento, user.numeroDocumento, user.nombres, user.apellidos, user.correo, user.telefono,
			user.idRol, user.idInstitucion, user.usuario, user.passwordHash],
	);
	return result.insertId;
}

async function updateUser(userId, user) {
	await pool.query(
		`UPDATE tblh_usuarios SET id_tipo_documento = ?, numero_documento = ?, nombres = ?, apellidos = ?,
			correo = ?, telefono = ?, id_institucion = ?, usuario = ?
		 WHERE id = ?`,
		[user.idTipoDocumento, user.numeroDocumento, user.nombres, user.apellidos, user.correo, user.telefono,
			user.idInstitucion, user.usuario, userId],
	);
}

async function setUserRole(userId, roleId) {
	await pool.query('UPDATE tblh_usuarios SET id_rol = ? WHERE id = ?', [roleId, userId]);
}

async function setUserActive(userId, active) {
	await pool.query('UPDATE tblh_usuarios SET estado = ? WHERE id = ?', [active ? 1 : 0, userId]);
}

async function countActiveAdmins() {
	const [rows] = await pool.query(
		"SELECT COUNT(*) AS total FROM tblh_usuarios u JOIN tbld_roles r ON r.id = u.id_rol WHERE u.estado = 1 AND r.nombre = 'ADMINISTRADOR'",
	);
	return Number(rows[0].total);
}

// Enlace de acceso (invitación o restablecimiento): reemplaza los anteriores del usuario.
async function replaceAccessToken(userId, tokenHash, hours) {
	await pool.query('DELETE FROM tblh_recuperacion_claves WHERE id_usuario = ?', [userId]);
	await pool.query(
		'INSERT INTO tblh_recuperacion_claves (id_usuario, token_hash, fecha_expiracion) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))',
		[userId, tokenHash, hours],
	);
}

async function listDocumentTypes() {
	const [rows] = await pool.query('SELECT id, codigo, nombre FROM tbld_tipos_documentos WHERE estado = 1 ORDER BY id');
	return rows;
}

// --- Instituciones ---

async function listInstitutions() {
	const [rows] = await pool.query(
		`SELECT i.id, i.nombre, i.codigo_dane, i.direccion, i.municipio, i.departamento, i.correo, i.telefono, i.estado,
				(SELECT COUNT(*) FROM tblh_usuarios u WHERE u.id_institucion = i.id AND u.estado = 1) AS usuarios
		 FROM tbld_instituciones i ORDER BY i.estado DESC, i.nombre`,
	);
	return rows;
}

async function saveInstitution(institutionId, fields) {
	const values = [fields.nombre, fields.codigoDane, fields.direccion, fields.municipio, fields.departamento, fields.correo, fields.telefono];
	if (institutionId) {
		await pool.query(
			`UPDATE tbld_instituciones SET nombre = ?, codigo_dane = ?, direccion = ?, municipio = ?, departamento = ?, correo = ?, telefono = ?
			 WHERE id = ?`,
			[...values, institutionId],
		);
		return institutionId;
	}
	const [result] = await pool.query(
		`INSERT INTO tbld_instituciones (nombre, codigo_dane, direccion, municipio, departamento, correo, telefono)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		values,
	);
	return result.insertId;
}

async function setInstitutionActive(institutionId, active) {
	const [result] = await pool.query('UPDATE tbld_instituciones SET estado = ? WHERE id = ?', [active ? 1 : 0, institutionId]);
	return result.affectedRows > 0;
}

async function institutionExists(institutionId) {
	const [rows] = await pool.query('SELECT id FROM tbld_instituciones WHERE id = ? AND estado = 1 LIMIT 1', [institutionId]);
	return rows.length > 0;
}

// --- Plantas ---

async function listPlants() {
	const [rows] = await pool.query(
		`SELECT pl.id, pl.nombre_comun, pl.nombre_cientifico, pl.tipo_cultivo, pl.descripcion, pl.estado,
				(SELECT COUNT(*) FROM tblh_proyectos p WHERE p.id_planta = pl.id AND p.estado = 1) AS proyectos
		 FROM tbld_plantas pl ORDER BY pl.estado DESC, pl.nombre_comun`,
	);
	return rows;
}

async function savePlant(plantId, fields) {
	const values = [fields.nombreComun, fields.nombreCientifico, fields.tipoCultivo, fields.descripcion];
	if (plantId) {
		await pool.query('UPDATE tbld_plantas SET nombre_comun = ?, nombre_cientifico = ?, tipo_cultivo = ?, descripcion = ? WHERE id = ?', [...values, plantId]);
		return plantId;
	}
	const [result] = await pool.query('INSERT INTO tbld_plantas (nombre_comun, nombre_cientifico, tipo_cultivo, descripcion) VALUES (?, ?, ?, ?)', values);
	return result.insertId;
}

async function setPlantActive(plantId, active) {
	const [result] = await pool.query('UPDATE tbld_plantas SET estado = ? WHERE id = ?', [active ? 1 : 0, plantId]);
	return result.affectedRows > 0;
}

// --- Dispositivos ---

async function listDevices() {
	const [rows] = await pool.query(
		`SELECT d.id, d.codigo_interno, d.serial, d.mac_address, d.modelo, d.version_firmware, d.estado,
				d.codigo_vinculacion IS NOT NULL AS pendiente_vinculacion,
				DATE_FORMAT(d.fecha_ultimo_contacto, '%Y-%m-%d %H:%i') AS fecha_ultimo_contacto,
				TIMESTAMPDIFF(MINUTE, d.fecha_ultimo_contacto, NOW()) AS minutos_sin_contacto,
				DATE_FORMAT(d.fecha_registro, '%Y-%m-%d %H:%i') AS fecha_registro,
				p.id AS id_proyecto, p.nombre AS proyecto, p.fecha_fin AS proyecto_fecha_fin,
				CASE WHEN p.id_dispositivo_camara = d.id THEN 'camara' WHEN p.id IS NOT NULL THEN 'sensor' ELSE NULL END AS slot,
				u.nombres AS estudiante_nombres, u.apellidos AS estudiante_apellidos,
				(SELECT COUNT(*) FROM tblh_registros_monitoreo r WHERE r.id_dispositivo = d.id AND r.fecha_registro >= NOW() - INTERVAL 1 DAY) AS lecturas_24h,
				(SELECT COUNT(*) FROM tblh_fotografias_monitoreo f WHERE f.id_dispositivo = d.id AND f.fecha_registro >= NOW() - INTERVAL 1 DAY) AS fotos_24h
		 FROM tbld_dispositivos d
		 LEFT JOIN tblh_proyectos p ON p.estado = 1 AND (p.id_dispositivo = d.id OR p.id_dispositivo_camara = d.id)
		 LEFT JOIN tblh_usuarios u ON u.id = p.id_usuario
		 ORDER BY d.estado DESC, d.fecha_ultimo_contacto IS NULL, d.fecha_ultimo_contacto DESC, d.id DESC`,
	);
	return rows;
}

async function findDevice(deviceId) {
	const [rows] = await pool.query(
		`SELECT d.id, d.codigo_interno, d.estado, p.id AS id_proyecto,
				CASE WHEN p.id_dispositivo_camara = d.id THEN 'camara' WHEN p.id IS NOT NULL THEN 'sensor' ELSE NULL END AS slot
		 FROM tbld_dispositivos d
		 LEFT JOIN tblh_proyectos p ON p.estado = 1 AND (p.id_dispositivo = d.id OR p.id_dispositivo_camara = d.id)
		 WHERE d.id = ? LIMIT 1`,
		[deviceId],
	);
	return rows[0] || null;
}

// Desactivar invalida su API key en la práctica: los endpoints del firmware exigen estado = 1.
async function setDeviceActive(deviceId, active) {
	await pool.query('UPDATE tbld_dispositivos SET estado = ? WHERE id = ?', [active ? 1 : 0, deviceId]);
}

// --- Auditoría ---

async function listAudit({ accion = null, idUsuario = null, desde = null, hasta = null, limit = 100, offset = 0 }) {
	const [rows] = await pool.query(
		`SELECT a.id, a.accion, a.entidad, a.id_entidad, a.detalle,
				DATE_FORMAT(a.fecha_registro, '%Y-%m-%d %H:%i:%s') AS fecha,
				u.id AS id_usuario, u.nombres, u.apellidos, u.usuario, UPPER(r.nombre) AS rol
		 FROM tblh_auditoria a
		 JOIN tblh_usuarios u ON u.id = a.id_usuario
		 JOIN tbld_roles r ON r.id = u.id_rol
		 WHERE (? IS NULL OR a.accion LIKE ?)
			AND (? IS NULL OR a.id_usuario = ?)
			AND (? IS NULL OR a.fecha_registro >= ?)
			AND (? IS NULL OR a.fecha_registro < DATE_ADD(?, INTERVAL 1 DAY))
		 ORDER BY a.fecha_registro DESC, a.id DESC
		 LIMIT ? OFFSET ?`,
		[accion, accion ? `${accion}%` : null, idUsuario, idUsuario, desde, desde, hasta, hasta, limit + 1, offset],
	);
	return rows;
}

async function listAuditActions() {
	const [rows] = await pool.query('SELECT DISTINCT accion FROM tblh_auditoria ORDER BY accion');
	return rows.map((row) => row.accion);
}

module.exports = {
	overview,
	quizOverview,
	listRoles,
	findRole,
	listUsers,
	findUser,
	findConflict,
	insertUser,
	updateUser,
	setUserRole,
	setUserActive,
	countActiveAdmins,
	replaceAccessToken,
	listDocumentTypes,
	listInstitutions,
	saveInstitution,
	setInstitutionActive,
	institutionExists,
	listPlants,
	savePlant,
	setPlantActive,
	listDevices,
	findDevice,
	setDeviceActive,
	listAudit,
	listAuditActions,
};
