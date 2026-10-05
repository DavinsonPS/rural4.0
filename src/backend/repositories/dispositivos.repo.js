const { pool } = require('../db');

// Dispositivo autenticado por su API key, con el proyecto activo donde ocupa slot de
// sensores o de cámara (si lo hay).
async function findByApiKeyHash(keyHash) {
	const [rows] = await pool.query(
		`SELECT d.id, d.codigo_interno, d.modelo,
				sensor_project.id AS id_proyecto_sensor,
				camera_project.id AS id_proyecto_camara,
				COALESCE(sensor_project.id, camera_project.id) AS id_proyecto,
				COALESCE(sensor_project.nombre, camera_project.nombre) AS nombre_proyecto,
				CASE WHEN camera_project.id IS NOT NULL THEN 'camara' ELSE 'sensor' END AS tipo_dispositivo,
				COALESCE(sensor_project.configuracion_led, camera_project.configuracion_led) AS configuracion_led,
				COALESCE(sensor_project.color_led, camera_project.color_led) AS color_led,
				COALESCE(sensor_project.brillo_led, camera_project.brillo_led) AS brillo_led,
				COALESCE(sensor_project.tipo_tierra, camera_project.tipo_tierra) AS tipo_tierra
		 FROM tbld_dispositivos d
		 LEFT JOIN tblh_proyectos sensor_project ON sensor_project.id_dispositivo = d.id AND sensor_project.estado = 1
		 LEFT JOIN tblh_proyectos camera_project ON camera_project.id_dispositivo_camara = d.id AND camera_project.estado = 1
		 WHERE d.api_key_hash = ? AND d.estado = 1
		 LIMIT 1`,
		[keyHash],
	);
	return rows[0] || null;
}

async function findByIdentifiers({ codigoInterno = null, serial = null, macAddress = null }) {
	const [rows] = await pool.query(
		`SELECT id, codigo_vinculacion, estado
		 FROM tbld_dispositivos
		 WHERE codigo_interno = ? OR serial = ? OR mac_address = ?
		 LIMIT 1`,
		[codigoInterno, serial, macAddress],
	);
	return rows[0] || null;
}

async function findLinkedProject(deviceId) {
	const [rows] = await pool.query(
		`SELECT id, nombre, id_usuario, id_docente, fecha_fin FROM tblh_proyectos
		 WHERE (id_dispositivo = ? OR id_dispositivo_camara = ?) AND estado = 1
		 LIMIT 1`,
		[deviceId, deviceId],
	);
	return rows[0] || null;
}

async function insert(device) {
	const [result] = await pool.query(
		`INSERT INTO tbld_dispositivos
		 (codigo_interno, serial, mac_address, modelo, fabricante, version_firmware, codigo_vinculacion, api_key_hash)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[device.codigoInterno, device.serial, device.macAddress, device.modelo, device.fabricante ?? null,
			device.versionFirmware, device.codigoVinculacion, device.apiKeyHash],
	);
	return result.insertId;
}

// fabricante solo se sobrescribe cuando se envía (el aprovisionamiento del firmware no lo manda).
async function updateIdentity(deviceId, device) {
	const setFabricante = device.fabricante !== undefined;
	await pool.query(
		`UPDATE tbld_dispositivos
		 SET codigo_interno = ?, serial = ?, mac_address = ?, modelo = ?,
			 ${setFabricante ? 'fabricante = ?,' : ''} version_firmware = ?, codigo_vinculacion = ?, api_key_hash = ?, estado = 1
		 WHERE id = ?`,
		[device.codigoInterno, device.serial, device.macAddress, device.modelo,
			...(setFabricante ? [device.fabricante] : []),
			device.versionFirmware, device.codigoVinculacion, device.apiKeyHash, deviceId],
	);
}

async function listPending(windowHours) {
	const [rows] = await pool.query(
		`SELECT d.id, d.codigo_interno, d.serial, d.mac_address, d.modelo,
				d.codigo_vinculacion, d.fecha_registro
		 FROM tbld_dispositivos d
		 LEFT JOIN tblh_proyectos sensor_project ON sensor_project.id_dispositivo = d.id AND sensor_project.estado = 1
		 LEFT JOIN tblh_proyectos camera_project ON camera_project.id_dispositivo_camara = d.id AND camera_project.estado = 1
		 WHERE d.estado = 1 AND sensor_project.id IS NULL AND camera_project.id IS NULL
			AND d.fecha_update >= NOW() - INTERVAL ? HOUR
		 ORDER BY d.fecha_registro DESC`,
		[windowHours],
	);
	return rows;
}

async function touchContact(deviceId) {
	await pool.query('UPDATE tbld_dispositivos SET fecha_ultimo_contacto = CURRENT_TIMESTAMP WHERE id = ?', [deviceId]);
}

async function findForLinking(connection, codigoInterno, codigoVinculacion) {
	const [rows] = await connection.query(
		`SELECT id, modelo FROM tbld_dispositivos
		 WHERE codigo_interno = ? AND codigo_vinculacion = ? AND estado = 1
		 LIMIT 1 FOR UPDATE`,
		[codigoInterno, codigoVinculacion],
	);
	return rows[0] || null;
}

async function lockProjectSlots(connection, projectId) {
	const [rows] = await connection.query(
		`SELECT id_dispositivo, id_dispositivo_camara FROM tblh_proyectos
		 WHERE id = ? AND estado = 1 LIMIT 1 FOR UPDATE`,
		[projectId],
	);
	return rows[0] || null;
}

async function findOtherAssignment(connection, deviceId, projectId) {
	const [rows] = await connection.query(
		`SELECT id, nombre FROM tblh_proyectos
		 WHERE (id_dispositivo = ? OR id_dispositivo_camara = ?) AND estado = 1 AND id <> ? LIMIT 1 FOR UPDATE`,
		[deviceId, deviceId, projectId],
	);
	return rows[0] || null;
}

async function assignSensor(connection, projectId, deviceId, led) {
	const [result] = await connection.query(
		`UPDATE tblh_proyectos SET id_dispositivo = ?, configuracion_led = ?, color_led = ?, brillo_led = ?, tipo_tierra = ?
		 WHERE id = ? AND estado = 1 AND id_dispositivo IS NULL`,
		[deviceId, led.configuracion, led.color, led.brillo, led.tierra, projectId],
	);
	return result.affectedRows > 0;
}

async function assignCamera(connection, projectId, deviceId) {
	const [result] = await connection.query(
		'UPDATE tblh_proyectos SET id_dispositivo_camara = ? WHERE id = ? AND estado = 1 AND id_dispositivo_camara IS NULL',
		[deviceId, projectId],
	);
	return result.affectedRows > 0;
}

async function markLinked(connection, deviceId) {
	await connection.query(
		'UPDATE tbld_dispositivos SET codigo_vinculacion = NULL, fecha_vinculacion = CURRENT_TIMESTAMP WHERE id = ?',
		[deviceId],
	);
}

async function releaseSensor(connection, projectId) {
	await connection.query(
		`UPDATE tblh_proyectos
		 SET id_dispositivo = NULL, configuracion_led = NULL, color_led = 'rojo', brillo_led = 255, tipo_tierra = NULL
		 WHERE id = ? AND estado = 1`,
		[projectId],
	);
}

async function releaseCamera(connection, projectId) {
	await connection.query('UPDATE tblh_proyectos SET id_dispositivo_camara = NULL WHERE id = ? AND estado = 1', [projectId]);
}

async function markUnlinked(connection, deviceId) {
	await connection.query(
		'UPDATE tbld_dispositivos SET codigo_vinculacion = NULL, fecha_vinculacion = NULL WHERE id = ?',
		[deviceId],
	);
}

async function updateLedConfiguration(projectId, led) {
	const [result] = await pool.query(
		`UPDATE tblh_proyectos
		 SET configuracion_led = ?, color_led = ?, brillo_led = ?, tipo_tierra = ?
		 WHERE id = ? AND estado = 1`,
		[led.configuracion, led.color, led.brillo, led.tierra, projectId],
	);
	return result.affectedRows > 0;
}

module.exports = {
	findByApiKeyHash,
	findByIdentifiers,
	findLinkedProject,
	insert,
	updateIdentity,
	listPending,
	touchContact,
	findForLinking,
	lockProjectSlots,
	findOtherAssignment,
	assignSensor,
	assignCamera,
	markLinked,
	releaseSensor,
	releaseCamera,
	markUnlinked,
	updateLedConfiguration,
};
