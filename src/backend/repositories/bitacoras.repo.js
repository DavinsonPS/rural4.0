const { pool } = require('../db');

const FIELDS = ['temperatura_ambiente_c', 'agua_aplicada_ml', 'hora_riego', 'humedad_suelo_pct', 'color_hojas', 'observacion', 'retos_completados'];

async function listByProject(projectId) {
	const [rows] = await pool.query(
		`SELECT id, fecha_bitacora, temperatura_ambiente_c, agua_aplicada_ml, hora_riego,
			humedad_suelo_pct, color_hojas, observacion, retos_completados
		 FROM tblh_bitacoras_diarias WHERE id_proyecto = ? AND estado = 1
		 ORDER BY fecha_bitacora DESC`,
		[projectId],
	);
	return rows;
}

async function findActiveById(logId) {
	const [rows] = await pool.query(
		'SELECT id, id_proyecto, fecha_bitacora, retos_completados FROM tblh_bitacoras_diarias WHERE id = ? AND estado = 1 LIMIT 1',
		[logId],
	);
	return rows[0] || null;
}

// Una bitácora por proyecto y día: si ya existe (aunque esté eliminada) se reactiva y actualiza.
async function upsertForDate(projectId, date, fields) {
	const connection = await pool.getConnection();
	try {
		await connection.beginTransaction();
		const [existingRows] = await connection.query(
			'SELECT id FROM tblh_bitacoras_diarias WHERE id_proyecto = ? AND fecha_bitacora = ? LIMIT 1 FOR UPDATE',
			[projectId, date],
		);
		const values = FIELDS.map((field) => fields[field]);
		if (existingRows.length) {
			await connection.query(
				`UPDATE tblh_bitacoras_diarias SET ${FIELDS.map((field) => `${field} = ?`).join(', ')}, estado = 1 WHERE id = ?`,
				[...values, existingRows[0].id],
			);
		} else {
			await connection.query(
				`INSERT INTO tblh_bitacoras_diarias (id_proyecto, fecha_bitacora, ${FIELDS.join(', ')})
				 VALUES (?, ?, ${FIELDS.map(() => '?').join(', ')})`,
				[projectId, date, ...values],
			);
		}
		await connection.commit();
	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		connection.release();
	}
}

async function update(logId, fields) {
	await pool.query(
		`UPDATE tblh_bitacoras_diarias SET ${FIELDS.map((field) => `${field} = ?`).join(', ')} WHERE id = ? AND estado = 1`,
		[...FIELDS.map((field) => fields[field]), logId],
	);
}

async function softDelete(logId) {
	await pool.query('UPDATE tblh_bitacoras_diarias SET estado = 0 WHERE id = ?', [logId]);
}

async function findActiveForDate(projectId, date) {
	const [rows] = await pool.query(
		`SELECT id, retos_completados FROM tblh_bitacoras_diarias
		 WHERE id_proyecto = ? AND fecha_bitacora = ? AND estado = 1 LIMIT 1`,
		[projectId, date],
	);
	return rows[0] || null;
}

async function setChallenges(logId, challengesJson) {
	await pool.query('UPDATE tblh_bitacoras_diarias SET retos_completados = ? WHERE id = ?', [challengesJson, logId]);
}

module.exports = { listByProject, findActiveById, upsertForDate, update, softDelete, findActiveForDate, setChallenges };
