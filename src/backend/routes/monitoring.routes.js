const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const { pool } = require('../db');

const router = express.Router();
const photoDirectory = path.join(__dirname, '..', 'uploads', 'photos');
fs.mkdirSync(photoDirectory, { recursive: true });
const upload = multer({
	dest: photoDirectory,
	limits: { fileSize: 8 * 1024 * 1024 },
	fileFilter: (request, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

async function getOwnedProject(projectId, userId) {
	const [rows] = await pool.query(
		`SELECT p.id, p.id_dispositivo FROM tblh_proyectos p
		 WHERE p.id = ? AND p.id_usuario = ? AND p.estado = 1 LIMIT 1`,
		[projectId, userId],
	);
	return rows[0] || null;
}

async function getDevice(request) {
	const key = (request.get('x-device-key') || '').trim();
	if (!key) return null;
	const hash = crypto.createHash('sha256').update(key).digest('hex');
	const [rows] = await pool.query(
		`SELECT d.id, p.id AS id_proyecto
		 FROM tbld_dispositivos d
		 JOIN tblh_proyectos p ON p.id_dispositivo = d.id AND p.estado = 1
		 WHERE d.api_key_hash = ? AND d.estado = 1 LIMIT 1`,
		[hash],
	);
	return rows[0] || null;
}

function validNumber(value) {
	return value === null || value === undefined || value === '' || Number.isFinite(Number(value));
}

function validTemperature(value) {
	return value === null || value === undefined || value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 50);
}

router.post('/lecturas', async (request, response) => {
	try {
		const device = await getDevice(request);
		if (!device) return response.status(401).json({ error: 'Clave de dispositivo inválida.' });
		const body = request.body || {};
		if (!body.fecha_lectura || !validTemperature(body.temperatura_c) || !validNumber(body.humedad_ambiente_pct) || !validNumber(body.humedad_suelo_pct) || !validNumber(body.intensidad_luz_lux)) {
			return response.status(400).json({ error: 'Fecha o medición inválida.' });
		}
		await pool.query(
			`INSERT INTO tblh_registros_monitoreo
			 (id_proyecto, id_dispositivo, fecha_lectura, temperatura_c, humedad_ambiente_pct, humedad_suelo_pct, intensidad_luz_lux)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[device.id_proyecto, device.id, body.fecha_lectura, body.temperatura_c, body.humedad_ambiente_pct, body.humedad_suelo_pct, body.intensidad_luz_lux ?? null],
		);
		await pool.query('UPDATE tbld_dispositivos SET fecha_ultimo_contacto = CURRENT_TIMESTAMP WHERE id = ?', [device.id]);
		return response.status(201).json({ status: 'ok', intensidad_luz_lux: body.intensidad_luz_lux ?? null });
	} catch (error) {
		console.error('Monitoring reading failed:', error.message);
		return response.status(500).json({ error: 'No fue posible guardar la lectura.' });
	}
});

router.post('/bitacoras', async (request, response) => {
	const projectId = Number(request.body?.id_proyecto);
	const userId = Number(request.body?.id_usuario);
	const temperature = request.body?.temperatura_ambiente_c;
	const water = request.body?.agua_aplicada_ml;
	const soilHumidity = request.body?.humedad_suelo_pct;
	const date = String(request.body?.fecha_bitacora || '').trim();
	const wateringTime = String(request.body?.hora_riego || '').trim() || null;
	const leafColor = String(request.body?.color_hojas || '').trim() || null;
	const observation = String(request.body?.observacion || '').trim() || null;

	if (!Number.isInteger(projectId) || projectId <= 0 || !Number.isInteger(userId) || userId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)
		|| !validTemperature(temperature) || !validNumber(water) || !validNumber(soilHumidity)) {
		return response.status(400).json({ error: 'Los datos de la bitácora son inválidos.' });
	}

	try {
		if (!await getOwnedProject(projectId, userId)) return response.status(404).json({ error: 'Proyecto no encontrado o inactivo.' });

		await pool.query(
			`INSERT INTO tblh_bitacoras_diarias
				(id_proyecto, fecha_bitacora, temperatura_ambiente_c, agua_aplicada_ml, hora_riego, humedad_suelo_pct, color_hojas, observacion)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			 ON DUPLICATE KEY UPDATE
				temperatura_ambiente_c = VALUES(temperatura_ambiente_c),
				agua_aplicada_ml = VALUES(agua_aplicada_ml),
				hora_riego = VALUES(hora_riego),
				humedad_suelo_pct = VALUES(humedad_suelo_pct),
				color_hojas = VALUES(color_hojas),
				observacion = VALUES(observacion),
				estado = 1`,
			[projectId, date, temperature ?? null, water ?? null, wateringTime, soilHumidity ?? null, leafColor, observation],
		);
		return response.status(201).json({ status: 'ok', fecha_bitacora: date });
	} catch (error) {
		console.error('Daily log failed:', error.message);
		return response.status(500).json({ error: 'No fue posible guardar la bitácora.' });
	}
});

router.get('/bitacoras', async (request, response) => {
	const projectId = Number(request.query.id_proyecto);
	const userId = Number(request.query.id_usuario);
	if (!projectId || !userId) return response.status(400).json({ error: 'Proyecto y usuario son obligatorios.' });
	try {
		if (!await getOwnedProject(projectId, userId)) return response.status(404).json({ error: 'Proyecto no encontrado.' });
		const [rows] = await pool.query(
			`SELECT id, fecha_bitacora, temperatura_ambiente_c, agua_aplicada_ml, hora_riego,
				humedad_suelo_pct, color_hojas, observacion
			 FROM tblh_bitacoras_diarias WHERE id_proyecto = ? AND estado = 1
			 ORDER BY fecha_bitacora DESC`,
			[projectId],
		);
		return response.json(rows);
	} catch (error) {
		console.error('Daily logs lookup failed:', error.message);
		return response.status(500).json({ error: 'No fue posible consultar las bitácoras.' });
	}
});

router.put('/bitacoras/:logId', async (request, response) => {
	const logId = Number(request.params.logId);
	const projectId = Number(request.body?.id_proyecto);
	const userId = Number(request.body?.id_usuario);
	if (!logId || !projectId || !userId) return response.status(400).json({ error: 'Bitácora, proyecto y usuario son obligatorios.' });
	try {
		if (!await getOwnedProject(projectId, userId)) return response.status(404).json({ error: 'Proyecto no encontrado.' });
		const fields = {
			temperatura_ambiente_c: request.body?.temperatura_ambiente_c ?? null,
			agua_aplicada_ml: request.body?.agua_aplicada_ml ?? null,
			hora_riego: request.body?.hora_riego || null,
			humedad_suelo_pct: request.body?.humedad_suelo_pct ?? null,
			color_hojas: request.body?.color_hojas || null,
			observacion: String(request.body?.observacion || '').trim() || null,
		};
		await pool.query(
			`UPDATE tblh_bitacoras_diarias SET temperatura_ambiente_c = ?, agua_aplicada_ml = ?, hora_riego = ?, humedad_suelo_pct = ?, color_hojas = ?, observacion = ?
			 WHERE id = ? AND id_proyecto = ? AND estado = 1`,
			[fields.temperatura_ambiente_c, fields.agua_aplicada_ml, fields.hora_riego, fields.humedad_suelo_pct, fields.color_hojas, fields.observacion, logId, projectId],
		);
		return response.json({ message: 'Bitácora actualizada correctamente.' });
	} catch (error) {
		console.error('Daily log update failed:', error.message);
		return response.status(500).json({ error: 'No fue posible actualizar la bitácora.' });
	}
});

router.delete('/bitacoras/:logId', async (request, response) => {
	const logId = Number(request.params.logId);
	const projectId = Number(request.query.id_proyecto);
	const userId = Number(request.query.id_usuario);
	if (!logId || !projectId || !userId) return response.status(400).json({ error: 'Bitácora, proyecto y usuario son obligatorios.' });
	try {
		if (!await getOwnedProject(projectId, userId)) return response.status(404).json({ error: 'Proyecto no encontrado.' });
		await pool.query('UPDATE tblh_bitacoras_diarias SET estado = 0 WHERE id = ? AND id_proyecto = ?', [logId, projectId]);
		return response.json({ message: 'Bitácora eliminada correctamente.' });
	} catch (error) {
		console.error('Daily log deletion failed:', error.message);
		return response.status(500).json({ error: 'No fue posible eliminar la bitácora.' });
	}
});

router.post('/fotografias', upload.single('foto'), async (request, response) => {
	try {
		const projectId = Number(request.body?.id_proyecto);
		const userId = Number(request.body?.id_usuario);
		const ownedProject = await getOwnedProject(projectId, userId);
		if (!ownedProject) return response.status(404).json({ error: 'Proyecto no encontrado.' });
		const device = await getDevice(request);
		if (!request.file) return response.status(400).json({ error: 'La foto JPEG es obligatoria.' });
		const date = new Date();
		const folder = path.join(photoDirectory, String(date.getUTCFullYear()), String(date.getUTCMonth() + 1).padStart(2, '0'));
		fs.mkdirSync(folder, { recursive: true });
		const extension = request.file.mimetype === 'image/png' ? 'png' : request.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
		const fileName = `${projectId}_${date.toISOString().replace(/[:.]/g, '-')}_${crypto.randomBytes(4).toString('hex')}.${extension}`;
		const finalPath = path.join(folder, fileName);
		fs.renameSync(request.file.path, finalPath);
		const relativePath = path.relative(path.join(__dirname, '..'), finalPath).replaceAll(path.sep, '/');
		await pool.query(
			`INSERT INTO tblh_fotografias_monitoreo
			 (id_proyecto, id_dispositivo, fecha_fotografia, ruta_archivo, nombre_archivo, tamano_bytes)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[projectId, device?.id || ownedProject.id_dispositivo || null, request.body.fecha_fotografia || date, relativePath, fileName, request.file.size],
		);
		return response.status(201).json({ status: 'ok', ruta: `/uploads/${relativePath.replace('uploads/', '')}` });
	} catch (error) {
		if (request.file?.path) fs.rmSync(request.file.path, { force: true });
		console.error('Monitoring photo failed:', error.message);
		return response.status(500).json({ error: 'No fue posible guardar la fotografía.' });
	}
});

router.get('/fotografias', async (request, response) => {
	const projectId = Number(request.query.id_proyecto);
	const userId = Number(request.query.id_usuario);
	if (!projectId || !userId) return response.status(400).json({ error: 'Proyecto y usuario son obligatorios.' });
	try {
		if (!await getOwnedProject(projectId, userId)) return response.status(404).json({ error: 'Proyecto no encontrado.' });
		const [rows] = await pool.query(
			`SELECT id, fecha_fotografia, ruta_archivo, nombre_archivo
			 FROM tblh_fotografias_monitoreo WHERE id_proyecto = ? AND estado = 1
			 ORDER BY fecha_fotografia DESC`,
			[projectId],
		);
		return response.json(rows.map((photo) => ({ ...photo, url: `/${photo.ruta_archivo}`.replace('/uploads/uploads/', '/uploads/') })));
	} catch (error) {
		console.error('Photo album lookup failed:', error.message);
		return response.status(500).json({ error: 'No fue posible consultar las fotografías.' });
	}
});

module.exports = router;
