const { pool } = require('../db');

async function insert({ idProyecto, idDispositivo, fechaFotografia, rutaArchivo, nombreArchivo, tamanoBytes }) {
	const [result] = await pool.query(
		`INSERT INTO tblh_fotografias_monitoreo
		 (id_proyecto, id_dispositivo, fecha_fotografia, ruta_archivo, nombre_archivo, tamano_bytes)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		[idProyecto, idDispositivo, fechaFotografia, rutaArchivo, nombreArchivo, tamanoBytes],
	);
	return result.insertId;
}

// estado = 0 significa "oculta por el docente"; las fotos no se borran físicamente.
// origin: 'estudiante' (subidas desde la web), 'camara' (ESP32-CAMERA) o null (todas).
async function listByProject(projectId, includeHidden, origin = null) {
	const [rows] = await pool.query(
		`SELECT id, id_dispositivo, fecha_fotografia, ruta_archivo, nombre_archivo, estado
		 FROM tblh_fotografias_monitoreo
		 WHERE id_proyecto = ? AND (estado = 1 OR ?)
			AND (? IS NULL OR (? = 'camara') = (id_dispositivo IS NOT NULL))
		 ORDER BY fecha_fotografia DESC`,
		[projectId, includeHidden ? 1 : 0, origin, origin],
	);
	return rows;
}

async function findById(photoId) {
	const [rows] = await pool.query(
		'SELECT id, id_proyecto, estado FROM tblh_fotografias_monitoreo WHERE id = ? LIMIT 1',
		[photoId],
	);
	return rows[0] || null;
}

async function setVisible(photoId, visible) {
	await pool.query('UPDATE tblh_fotografias_monitoreo SET estado = ? WHERE id = ?', [visible ? 1 : 0, photoId]);
}

// Fotos de la ESP32-CAMERA (id_dispositivo no nulo), visibles, en orden cronológico.
// hours = null trae todo el historial.
async function listCameraFrames(projectId, hours = null) {
	const [rows] = await pool.query(
		`SELECT id, ruta_archivo, DATE_FORMAT(fecha_fotografia, '%Y-%m-%d %H:%i:%s') AS fecha
		 FROM tblh_fotografias_monitoreo
		 WHERE id_proyecto = ? AND estado = 1 AND id_dispositivo IS NOT NULL
			AND (? IS NULL OR fecha_fotografia >= NOW() - INTERVAL ? HOUR)
		 ORDER BY fecha_fotografia ASC, id ASC`,
		[projectId, hours, hours],
	);
	return rows;
}

module.exports = { insert, listByProject, findById, setVisible, listCameraFrames };
