const { pool } = require('../db');

async function insert({ idProyecto, idDispositivo, fechaLectura, temperatura, humedadAmbiente, humedadSuelo, luz }) {
	await pool.query(
		`INSERT INTO tblh_registros_monitoreo
		 (id_proyecto, id_dispositivo, fecha_lectura, temperatura_c, humedad_ambiente_pct, humedad_suelo_pct, intensidad_luz_lux)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[idProyecto, idDispositivo, fechaLectura, temperatura, humedadAmbiente, humedadSuelo, luz],
	);
}

async function findLatest(projectId) {
	const [rows] = await pool.query(
		`SELECT temperatura_c, humedad_ambiente_pct, humedad_suelo_pct,
				intensidad_luz_lux, altura_planta_cm, agua_aplicada_ml,
				observacion, fecha_registro AS fecha_lectura
			 FROM tblh_registros_monitoreo
			 WHERE id_proyecto = ? AND estado = 1
			 ORDER BY fecha_registro DESC
			 LIMIT 1`,
		[projectId],
	);
	return rows[0] || null;
}

// Se ordena por fecha_registro (hora del servidor) porque el reloj del ESP32 no es confiable.
async function listRecent(projectId, limit) {
	const [rows] = await pool.query(
		`SELECT temperatura_c, humedad_ambiente_pct, humedad_suelo_pct,
				intensidad_luz_lux, fecha_registro AS fecha_lectura
			 FROM tblh_registros_monitoreo
			 WHERE id_proyecto = ? AND estado = 1
			 ORDER BY fecha_registro DESC
			 LIMIT ?`,
		[projectId, limit],
	);
	return rows;
}

// Últimas N lecturas de cada proyecto, en una sola consulta.
async function listLatestPerProject(projectIds, perProject) {
	if (!projectIds.length) return [];
	const [rows] = await pool.query(
		`SELECT id_proyecto, temperatura_c, humedad_ambiente_pct, humedad_suelo_pct, intensidad_luz_lux,
				fecha_registro AS fecha_lectura, fecha_texto, minutos
			 FROM (
				SELECT r.id_proyecto, r.temperatura_c, r.humedad_ambiente_pct, r.humedad_suelo_pct,
					r.intensidad_luz_lux, r.fecha_registro,
					DATE_FORMAT(r.fecha_registro, '%Y-%m-%d %H:%i') AS fecha_texto,
					TIMESTAMPDIFF(MINUTE, r.fecha_registro, NOW()) AS minutos,
					ROW_NUMBER() OVER (PARTITION BY r.id_proyecto ORDER BY r.fecha_registro DESC) AS posicion
				FROM tblh_registros_monitoreo r
				WHERE r.estado = 1 AND r.id_proyecto IN (?)
			 ) recientes
			 WHERE posicion <= ?
			 ORDER BY id_proyecto, fecha_registro DESC`,
		[projectIds, perProject],
	);
	return rows;
}

module.exports = { insert, findLatest, listRecent, listLatestPerProject };
