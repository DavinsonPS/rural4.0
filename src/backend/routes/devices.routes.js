const crypto = require('node:crypto');
const express = require('express');
const { pool } = require('../db');

const router = express.Router();

function normalize(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function createLinkCode() {
	return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function createApiKey() {
	return crypto.randomBytes(32).toString('hex');
}

function hasRegistrationAccess(request) {
	const configuredKey = normalize(process.env.DEVICE_REGISTRATION_KEY);
	return configuredKey && request.get('x-registration-key') === configuredKey;
}

function hasProvisioningAccess(request) {
	const configuredKey = normalize(process.env.DEVICE_PROVISIONING_KEY);
	return configuredKey && request.get('x-provisioning-key') === configuredKey;
}

async function getAuthenticatedDevice(request) {
	const key = normalize(request.get('x-device-key'));
	if (!key) return null;
	const keyHash = crypto.createHash('sha256').update(key).digest('hex');
	const [rows] = await pool.query(
		`SELECT d.id, d.codigo_interno, p.id AS id_proyecto,
				p.configuracion_led, p.color_led, p.brillo_led
		 FROM tbld_dispositivos d
		 LEFT JOIN tblh_proyectos p ON p.id_dispositivo = d.id AND p.estado = 1
		 WHERE d.api_key_hash = ? AND d.estado = 1
		 LIMIT 1`,
		[keyHash],
	);
	return rows[0] || null;
}

router.post('/provisionar', async (request, response) => {
	if (!hasProvisioningAccess(request)) {
		return response.status(401).json({ error: 'Clave de provisión inválida o no configurada.' });
	}

	const macAddress = normalize(request.body?.mac_address).toUpperCase() || null;
	const serial = normalize(request.body?.serial) || null;
	const codigoInterno = normalize(request.body?.codigo_interno) || (macAddress ? `RURAL-${macAddress.replaceAll(':', '').slice(-6)}` : '');
	const model = normalize(request.body?.modelo) || 'ESP32';
	const firmware = normalize(request.body?.version_firmware) || null;

	if (!codigoInterno || (!macAddress && !serial)) {
		return response.status(400).json({ error: 'La provisión requiere MAC o serial.' });
	}

	try {
		const [existingRows] = await pool.query(
			`SELECT id, codigo_vinculacion
			 FROM tbld_dispositivos
			 WHERE mac_address = ? OR serial = ?
			 LIMIT 1`,
			[macAddress, serial],
		);
		const apiKey = createApiKey();
		const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
		const linkCode = existingRows[0]?.codigo_vinculacion || createLinkCode();

		if (existingRows.length > 0) {
			await pool.query(
				`UPDATE tbld_dispositivos
				 SET codigo_interno = ?, mac_address = ?, serial = ?, modelo = ?,
					 version_firmware = ?, codigo_vinculacion = ?, api_key_hash = ?, estado = 1
				 WHERE id = ?`,
				[codigoInterno, macAddress, serial, model, firmware, linkCode, apiKeyHash, existingRows[0].id],
			);
			return response.json({ id: existingRows[0].id, codigo_interno: codigoInterno, codigo_vinculacion: linkCode, api_key: apiKey, nuevo: false });
		}

		const [result] = await pool.query(
			`INSERT INTO tbld_dispositivos
			 (codigo_interno, serial, mac_address, modelo, version_firmware, codigo_vinculacion, api_key_hash)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[codigoInterno, serial, macAddress, model, firmware, linkCode, apiKeyHash],
		);
		return response.status(201).json({ id: result.insertId, codigo_interno: codigoInterno, codigo_vinculacion: linkCode, api_key: apiKey, nuevo: true });
	} catch (error) {
		console.error('Device provisioning failed:', error.message);
		return response.status(500).json({ error: 'No fue posible provisionar el dispositivo.' });
	}
});

router.get('/pendientes', async (request, response) => {
	if (!hasRegistrationAccess(request)) {
		return response.status(401).json({ error: 'Clave de registro de dispositivo inválida.' });
	}

	try {
		const [rows] = await pool.query(
			`SELECT d.id, d.codigo_interno, d.serial, d.mac_address, d.modelo,
					d.codigo_vinculacion, d.fecha_registro
			 FROM tbld_dispositivos d
			 LEFT JOIN tblh_proyectos p ON p.id_dispositivo = d.id AND p.estado = 1
			 WHERE d.estado = 1 AND p.id IS NULL
			 ORDER BY d.fecha_registro DESC`,
		);
		return response.json(rows);
	} catch (error) {
		console.error('Pending device list failed:', error.message);
		return response.status(500).json({ error: 'No fue posible consultar los dispositivos pendientes.' });
	}
});

router.get('/configuracion', async (request, response) => {
	try {
		const device = await getAuthenticatedDevice(request);
		if (!device) return response.status(401).json({ error: 'Clave de dispositivo inválida.' });
		return response.json({
			dispositivo_id: device.id,
			codigo_interno: device.codigo_interno,
			proyecto_id: device.id_proyecto,
			configuracion_led: device.configuracion_led || 'maxima',
			color_led: device.color_led || 'rojo',
			brillo_led: Number(device.brillo_led ?? 255),
		});
	} catch (error) {
		console.error('Device configuration failed:', error.message);
		return response.status(500).json({ error: 'No fue posible consultar la configuración.' });
	}
});

router.get('/proyectos/:projectId/estado', async (request, response) => {
	const projectId = Number(request.params.projectId);
	if (!Number.isInteger(projectId) || projectId <= 0) {
		return response.status(400).json({ error: 'Identificador de proyecto inválido.' });
	}

	try {
		const [rows] = await pool.query(
			`SELECT p.id, p.id_dispositivo, d.codigo_interno, d.mac_address,
					d.modelo, d.fecha_ultimo_contacto
			 FROM tblh_proyectos p
			 LEFT JOIN tbld_dispositivos d ON d.id = p.id_dispositivo AND d.estado = 1
			 WHERE p.id = ? AND p.estado = 1
			 LIMIT 1`,
			[projectId],
		);

		if (rows.length === 0) {
			return response.status(404).json({ error: 'Proyecto no encontrado.' });
		}

		const project = rows[0];
		return response.json({
			proyecto_id: project.id,
			dispositivo_vinculado: Boolean(project.id_dispositivo),
			dispositivo: project.id_dispositivo ? {
				id: project.id_dispositivo,
				codigo_interno: project.codigo_interno,
				mac_address: project.mac_address,
				modelo: project.modelo,
				fecha_ultimo_contacto: project.fecha_ultimo_contacto,
			} : null,
		});
	} catch (error) {
		console.error('Project device status failed:', error.message);
		return response.status(500).json({ error: 'No fue posible consultar el dispositivo del proyecto.' });
	}
});

router.post('/registrar', async (request, response) => {
	if (!hasRegistrationAccess(request)) {
		return response.status(401).json({ error: 'Clave de registro de dispositivo inválida.' });
	}

	const device = {
		codigoInterno: normalize(request.body.codigo_interno),
		serial: normalize(request.body.serial) || null,
		macAddress: normalize(request.body.mac_address).toUpperCase() || null,
		modelo: normalize(request.body.modelo) || null,
		fabricante: normalize(request.body.fabricante) || null,
		versionFirmware: normalize(request.body.version_firmware) || null,
	};

	if (!device.codigoInterno || (!device.serial && !device.macAddress)) {
		return response.status(400).json({
			error: 'codigo_interno y MAC o serial son obligatorios.',
		});
	}

	try {
		const [existingRows] = await pool.query(
			`SELECT id, codigo_vinculacion
			 FROM tbld_dispositivos
			 WHERE codigo_interno = ? OR serial = ? OR mac_address = ?
			 LIMIT 1`,
			[device.codigoInterno, device.serial, device.macAddress],
		);

		if (existingRows.length > 0) {
			const existing = existingRows[0];
			const linkCode = existing.codigo_vinculacion || createLinkCode();
			const apiKey = createApiKey();
			await pool.query(
				`UPDATE tbld_dispositivos
				 SET codigo_interno = ?, serial = ?, mac_address = ?, modelo = ?,
				 fabricante = ?, version_firmware = ?, codigo_vinculacion = ?, api_key_hash = ?, estado = 1
				 WHERE id = ?`,
				[
					device.codigoInterno,
					device.serial,
					device.macAddress,
					device.modelo,
					device.fabricante,
					device.versionFirmware,
					linkCode,
					crypto.createHash('sha256').update(apiKey).digest('hex'),
					existing.id,
				],
			);
			return response.json({ id: existing.id, codigo_vinculacion: linkCode, api_key: apiKey, nuevo: false });
		}

		const linkCode = createLinkCode();
		const apiKey = createApiKey();
		const [result] = await pool.query(
			`INSERT INTO tbld_dispositivos
			 (codigo_interno, serial, mac_address, modelo, fabricante, version_firmware, codigo_vinculacion, api_key_hash)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				device.codigoInterno,
				device.serial,
				device.macAddress,
				device.modelo,
				device.fabricante,
				device.versionFirmware,
				linkCode,
				crypto.createHash('sha256').update(apiKey).digest('hex'),
			],
		);

		return response.status(201).json({
			id: result.insertId,
			codigo_interno: device.codigoInterno,
			codigo_vinculacion: linkCode,
			api_key: apiKey,
			nuevo: true,
		});
	} catch (error) {
		console.error('Device registration failed:', error.message);
		return response.status(500).json({ error: 'No fue posible registrar el dispositivo.' });
	}
});

router.post('/proyectos/:projectId/vincular', async (request, response) => {
	if (!hasRegistrationAccess(request)) {
		return response.status(401).json({ error: 'Clave de registro de dispositivo inválida.' });
	}

	const projectId = Number(request.params.projectId);
	const codigoInterno = normalize(request.body.codigo_interno);
	const codigoVinculacion = normalize(request.body.codigo_vinculacion).toUpperCase();
	const ledConfiguration = normalize(request.body?.configuracion_led) || 'maxima';
	const ledColor = normalize(request.body?.color_led) || 'rojo';
	const brightness = Number(request.body?.brillo_led);
	const soilType = normalize(request.body?.tipo_tierra) || null;
	const allowedConfigurations = ['suave', 'media', 'intensa', 'maxima'];
	const allowedColors = ['rojo', 'verde', 'azul', 'blanco', 'amarillo', 'morado'];
	const allowedSoilTypes = ['franca', 'arenosa', 'arcillosa', 'compost'];

	if (!Number.isInteger(projectId) || projectId <= 0 || !codigoInterno || !codigoVinculacion
		|| !allowedConfigurations.includes(ledConfiguration) || !allowedColors.includes(ledColor)
		|| !Number.isInteger(brightness) || brightness < 0 || brightness > 255
		|| !allowedSoilTypes.includes(soilType)) {
		return response.status(400).json({ error: 'Los datos del dispositivo o su configuración son inválidos.' });
	}

	const connection = await pool.getConnection();
	try {
		await connection.beginTransaction();
		const [devices] = await connection.query(
			`SELECT id FROM tbld_dispositivos
			 WHERE codigo_interno = ? AND codigo_vinculacion = ? AND estado = 1
			 LIMIT 1 FOR UPDATE`,
			[codigoInterno, codigoVinculacion],
		);

		if (devices.length === 0) {
			await connection.rollback();
			return response.status(404).json({ error: 'Dispositivo no encontrado o código de vinculación inválido.' });
		}

		const deviceId = devices[0].id;
		const [assignedProjects] = await connection.query(
			`SELECT id, nombre FROM tblh_proyectos
			 WHERE id_dispositivo = ? AND estado = 1 AND id <> ? LIMIT 1 FOR UPDATE`,
			[deviceId, projectId],
		);
		if (assignedProjects.length > 0) {
			await connection.rollback();
			return response.status(409).json({ error: `El dispositivo ya está vinculado al proyecto "${assignedProjects[0].nombre}".` });
		}
		const [result] = await connection.query(
			`UPDATE tblh_proyectos
			 SET id_dispositivo = ?, configuracion_led = ?, color_led = ?, brillo_led = ?, tipo_tierra = ?
			 WHERE id = ? AND estado = 1 AND id_dispositivo IS NULL`,
			[deviceId, ledConfiguration, ledColor, brightness, soilType, projectId],
		);

		if (result.affectedRows === 0) {
			await connection.rollback();
			return response.status(409).json({ error: 'El proyecto no existe, está inactivo o ya tiene un dispositivo.' });
		}

		await connection.query(
			`UPDATE tbld_dispositivos
			 SET codigo_vinculacion = NULL, fecha_vinculacion = CURRENT_TIMESTAMP
			 WHERE id = ?`,
			[deviceId],
		);
		await connection.commit();
		return response.json({
			status: 'ok',
			dispositivo_id: deviceId,
			proyecto_id: projectId,
			configuracion_led: ledConfiguration,
			color_led: ledColor,
			brillo_led: brightness,
			tipo_tierra: soilType,
		});
	} catch (error) {
		await connection.rollback();
		if (error.code === 'ER_DUP_ENTRY' && error.sqlMessage?.includes('uk_tblh_proyectos_dispositivo')) {
			return response.status(409).json({ error: 'El dispositivo ya está vinculado a otro proyecto activo.' });
		}
		console.error('Device linking failed:', error.message);
		return response.status(500).json({ error: 'No fue posible vincular el dispositivo.' });
	} finally {
		connection.release();
	}
});

router.post('/proyectos/:projectId/configuracion', async (request, response) => {
	if (!hasRegistrationAccess(request)) {
		return response.status(401).json({ error: 'Clave de registro de dispositivo inválida.' });
	}

	const projectId = Number(request.params.projectId);
	const ledConfiguration = normalize(request.body?.configuracion_led) || 'maxima';
	const ledColor = normalize(request.body?.color_led) || 'rojo';
	const brightness = Number(request.body?.brillo_led);
	const soilType = normalize(request.body?.tipo_tierra) || null;
	const allowedConfigurations = ['suave', 'media', 'intensa', 'maxima'];
	const allowedColors = ['rojo', 'verde', 'azul', 'blanco', 'amarillo', 'morado'];

	if (!Number.isInteger(projectId) || projectId <= 0 || !allowedConfigurations.includes(ledConfiguration)
		|| !allowedColors.includes(ledColor) || !Number.isInteger(brightness) || brightness < 0 || brightness > 255) {
		return response.status(400).json({ error: 'Configuración LED inválida.' });
	}

	try {
		const [result] = await pool.query(
			`UPDATE tblh_proyectos
			 SET configuracion_led = ?, color_led = ?, brillo_led = ?, tipo_tierra = ?
			 WHERE id = ? AND estado = 1`,
			[ledConfiguration, ledColor, brightness, soilType, projectId],
		);
		if (result.affectedRows === 0) return response.status(404).json({ error: 'Proyecto no encontrado o inactivo.' });
		return response.json({
			status: 'ok',
			configuracion_led: ledConfiguration,
			color_led: ledColor,
			brillo_led: brightness,
			tipo_tierra: soilType,
		});
	} catch (error) {
		console.error('Project LED configuration failed:', error.message);
		return response.status(500).json({ error: 'No fue posible guardar la configuración LED.' });
	}
});

router.delete('/proyectos/:projectId', async (request, response) => {
	const projectId = Number(request.params.projectId);
	if (!Number.isInteger(projectId) || projectId <= 0) {
		return response.status(400).json({ error: 'Identificador de proyecto inválido.' });
	}

	const connection = await pool.getConnection();
	try {
		await connection.beginTransaction();
		const [projectRows] = await connection.query(
			`SELECT id_dispositivo
			 FROM tblh_proyectos
			 WHERE id = ? AND estado = 1
			 LIMIT 1 FOR UPDATE`,
			[projectId],
		);

		if (projectRows.length === 0) {
			await connection.rollback();
			return response.status(404).json({ error: 'Proyecto no encontrado o inactivo.' });
		}

		const deviceId = projectRows[0].id_dispositivo;
		await connection.query(
			`UPDATE tblh_proyectos
			 SET id_dispositivo = NULL, configuracion_led = NULL, color_led = 'rojo', brillo_led = 255, tipo_tierra = NULL
			 WHERE id = ? AND estado = 1`,
			[projectId],
		);

		if (deviceId) {
			await connection.query(
				`UPDATE tbld_dispositivos
				 SET codigo_vinculacion = NULL, fecha_vinculacion = NULL
				 WHERE id = ?`,
				[deviceId],
			);
		}

		await connection.commit();
		return response.json({ status: 'ok', proyecto_id: projectId, dispositivo_desvinculado: Boolean(deviceId) });
	} catch (error) {
		await connection.rollback();
		console.error('Device unlink failed:', error.message);
		return response.status(500).json({ error: 'No fue posible desvincular el dispositivo.' });
	} finally {
		connection.release();
	}
});

module.exports = router;
