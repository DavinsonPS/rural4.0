const { pool } = require('../db');

// Columnas mínimas para decidir permisos y reglas sobre un proyecto.
const BASE_COLUMNS = `p.id, p.nombre, p.descripcion, p.id_usuario, p.id_docente, p.id_planta,
	p.id_dispositivo, p.id_dispositivo_camara, p.configuracion_led, p.color_led, p.brillo_led,
	p.tipo_tierra, p.fecha_inicio, p.fecha_fin, u.id_institucion`;

async function findActiveById(projectId, connection = pool) {
	const [rows] = await connection.query(
		`SELECT ${BASE_COLUMNS}
		 FROM tblh_proyectos p
		 JOIN tblh_usuarios u ON u.id = p.id_usuario
		 WHERE p.id = ? AND p.estado = 1
		 LIMIT 1`,
		[projectId],
	);
	return rows[0] || null;
}

async function listByStudent(userId) {
	const [rows] = await pool.query(
		`SELECT p.id, p.nombre, p.descripcion, p.id_usuario, p.id_planta,
				pl.nombre_comun AS planta, p.id_dispositivo, p.id_dispositivo_camara,
				p.id_docente,
				d.codigo_interno, camera.codigo_interno AS camera_codigo_interno,
				camera.modelo AS camera_modelo, p.fecha_inicio, p.fecha_fin, p.estado,
				u.nombres AS usuario_nombres, u.apellidos AS usuario_apellidos,
				docente.nombres AS docente_nombres, docente.apellidos AS docente_apellidos,
				i.nombre AS institucion_nombre
			 FROM tblh_proyectos p
			 JOIN tbld_plantas pl ON pl.id = p.id_planta
			 LEFT JOIN tbld_dispositivos d ON d.id = p.id_dispositivo
			 LEFT JOIN tbld_dispositivos camera ON camera.id = p.id_dispositivo_camara
			 JOIN tblh_usuarios u ON u.id = p.id_usuario
			 LEFT JOIN tblh_usuarios docente ON docente.id = p.id_docente
			 LEFT JOIN tbld_instituciones i ON i.id = u.id_institucion
			 WHERE p.id_usuario = ? AND p.estado = 1
			 ORDER BY p.fecha_registro DESC`,
		[userId],
	);
	return rows;
}

async function findSummaryById(projectId) {
	const [rows] = await pool.query(
		`SELECT p.id, p.nombre, p.descripcion, p.id_usuario, p.id_planta,
				p.id_docente,
				pl.nombre_comun AS planta, p.id_dispositivo, p.id_dispositivo_camara,
				d.codigo_interno, d.mac_address, d.modelo, d.fecha_ultimo_contacto,
				camera.codigo_interno AS camera_codigo_interno, camera.mac_address AS camera_mac_address,
				camera.modelo AS camera_modelo, camera.fecha_ultimo_contacto AS camera_fecha_ultimo_contacto,
				p.configuracion_led, p.color_led, p.brillo_led, p.tipo_tierra, p.fecha_inicio, p.fecha_fin,
				u.nombres AS usuario_nombres, u.apellidos AS usuario_apellidos, u.usuario AS usuario_usuario,
				docente.nombres AS docente_nombres, docente.apellidos AS docente_apellidos,
				i.nombre AS institucion_nombre
			 FROM tblh_proyectos p
			 JOIN tbld_plantas pl ON pl.id = p.id_planta
			 JOIN tblh_usuarios u ON u.id = p.id_usuario
			 LEFT JOIN tblh_usuarios docente ON docente.id = p.id_docente
			 LEFT JOIN tbld_instituciones i ON i.id = u.id_institucion
			 LEFT JOIN tbld_dispositivos d ON d.id = p.id_dispositivo
			 LEFT JOIN tbld_dispositivos camera ON camera.id = p.id_dispositivo_camara
			 WHERE p.id = ? AND p.estado = 1
			 LIMIT 1`,
		[projectId],
	);
	return rows[0] || null;
}

async function create({ nombre, descripcion, idUsuario, idDocente, idPlanta, fechaInicio }) {
	const [result] = await pool.query(
		`INSERT INTO tblh_proyectos (nombre, descripcion, id_usuario, id_docente, id_planta, fecha_inicio)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		[nombre, descripcion, idUsuario, idDocente, idPlanta, fechaInicio],
	);
	return result.insertId;
}

async function updateInfo(projectId, { nombre, descripcion, idDocente, idPlanta }) {
	await pool.query(
		'UPDATE tblh_proyectos SET nombre = ?, descripcion = ?, id_docente = ?, id_planta = ? WHERE id = ? AND estado = 1',
		[nombre, descripcion, idDocente, idPlanta, projectId],
	);
}

async function archive(projectId) {
	await pool.query('UPDATE tblh_proyectos SET estado = 0 WHERE id = ?', [projectId]);
}

async function setEndDate(projectId, finalize) {
	const [result] = await pool.query(
		finalize
			? 'UPDATE tblh_proyectos SET fecha_fin = CURDATE() WHERE id = ? AND estado = 1 AND fecha_fin IS NULL'
			: 'UPDATE tblh_proyectos SET fecha_fin = NULL WHERE id = ? AND estado = 1 AND fecha_fin IS NOT NULL',
		[projectId],
	);
	return result.affectedRows > 0;
}

async function setTeacher(projectId, teacherId) {
	await pool.query('UPDATE tblh_proyectos SET id_docente = ? WHERE id = ? AND estado = 1', [teacherId, projectId]);
}

// Proyectos activos (no archivados) de un docente, con los datos agregados que usa el
// semáforo. Una sola consulta: las subconsultas usan el índice (id_proyecto, fecha_bitacora).
async function listForTeacherPanel(teacherId = null) {
	const [rows] = await pool.query(
		`SELECT p.id, p.nombre, p.descripcion, p.id_planta, pl.nombre_comun AS planta,
				DATE_FORMAT(p.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
				DATE_FORMAT(p.fecha_fin, '%Y-%m-%d') AS fecha_fin,
				p.id_dispositivo, p.id_dispositivo_camara,
				p.configuracion_led, p.color_led, p.brillo_led, p.tipo_tierra, p.id_docente,
				u.id AS id_estudiante, u.nombres AS estudiante_nombres, u.apellidos AS estudiante_apellidos,
				u.usuario AS estudiante_usuario,
				d.codigo_interno AS sensor_codigo,
				TIMESTAMPDIFF(MINUTE, d.fecha_ultimo_contacto, NOW()) AS sensor_minutos_sin_contacto,
				cam.codigo_interno AS camara_codigo,
				TIMESTAMPDIFF(MINUTE, cam.fecha_ultimo_contacto, NOW()) AS camara_minutos_sin_contacto,
				DATEDIFF(CURDATE(), COALESCE(p.fecha_inicio, DATE(p.fecha_registro))) + 1 AS dias_desde_inicio,
				(SELECT DATE_FORMAT(MAX(b.fecha_bitacora), '%Y-%m-%d') FROM tblh_bitacoras_diarias b
					WHERE b.id_proyecto = p.id AND b.estado = 1) AS ultima_bitacora,
				DATEDIFF(CURDATE(), COALESCE(
					(SELECT MAX(b.fecha_bitacora) FROM tblh_bitacoras_diarias b WHERE b.id_proyecto = p.id AND b.estado = 1),
					p.fecha_inicio, DATE(p.fecha_registro))) AS dias_sin_bitacora,
				(SELECT COUNT(*) FROM tblh_bitacoras_diarias b
					WHERE b.id_proyecto = p.id AND b.estado = 1 AND b.fecha_bitacora >= CURDATE() - INTERVAL 6 DAY) AS bitacoras_7d,
				(SELECT COUNT(*) FROM tblh_bitacoras_diarias b
					WHERE b.id_proyecto = p.id AND b.estado = 1 AND b.fecha_bitacora >= CURDATE() - INTERVAL 29 DAY) AS bitacoras_30d,
				(SELECT COALESCE(SUM(JSON_LENGTH(b.retos_completados)), 0) FROM tblh_bitacoras_diarias b
					WHERE b.id_proyecto = p.id AND b.estado = 1) AS retos_total,
				(SELECT b.retos_completados FROM tblh_bitacoras_diarias b
					WHERE b.id_proyecto = p.id AND b.estado = 1 AND b.fecha_bitacora = CURDATE() LIMIT 1) AS retos_hoy
			 FROM tblh_proyectos p
			 JOIN tbld_plantas pl ON pl.id = p.id_planta
			 JOIN tblh_usuarios u ON u.id = p.id_usuario
			 LEFT JOIN tbld_dispositivos d ON d.id = p.id_dispositivo
			 LEFT JOIN tbld_dispositivos cam ON cam.id = p.id_dispositivo_camara
			 WHERE p.estado = 1 AND (? IS NULL OR p.id_docente = ?)
			 ORDER BY u.apellidos ASC, u.nombres ASC, p.nombre ASC`,
		[teacherId, teacherId],
	);
	return rows;
}

module.exports = {
	findActiveById,
	listByStudent,
	findSummaryById,
	create,
	updateInfo,
	archive,
	setEndDate,
	setTeacher,
	listForTeacherPanel,
};
