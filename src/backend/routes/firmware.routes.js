const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { pool } = require('../db');

const router = express.Router();
const firmwareDirectory = path.join(__dirname, '..', 'esp32-firmware');
const firmwarePath = path.join(firmwareDirectory, 'firmware.bin');
const manifestPath = path.join(firmwareDirectory, 'manifest.json');

function normalize(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function hasRegistrationAccess(request) {
	const configuredKey = normalize(process.env.DEVICE_REGISTRATION_KEY);
	return configuredKey && request.get('x-registration-key') === configuredKey;
}

async function getDevice(request) {
	const key = normalize(request.get('x-device-key'));
	if (!key) return null;
	const hash = crypto.createHash('sha256').update(key).digest('hex');
	const [rows] = await pool.query(
		`SELECT id FROM tbld_dispositivos WHERE api_key_hash = ? AND estado = 1 LIMIT 1`,
		[hash],
	);
	return rows[0] || null;
}

function readPublishedFirmware() {
	if (!fs.existsSync(firmwarePath) || !fs.existsSync(manifestPath)) return null;
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	const fileStats = fs.statSync(firmwarePath);
	const fileHash = crypto.createHash('sha256').update(fs.readFileSync(firmwarePath)).digest('hex');
	if (!/^\d+\.\d+\.\d+$/.test(normalize(manifest.version))) throw new Error('Versión OTA inválida.');
	if (!/^[a-f0-9]{64}$/i.test(normalize(manifest.sha256))) throw new Error('SHA-256 OTA inválido.');
	if (Number(manifest.tamano_bytes) !== fileStats.size) throw new Error('El tamaño del manifiesto no coincide con firmware.bin.');
	if (normalize(manifest.sha256).toLowerCase() !== fileHash) throw new Error('El SHA-256 del manifiesto no coincide con firmware.bin.');
	return {
		version: normalize(manifest.version),
		sha256: normalize(manifest.sha256).toLowerCase(),
		tamano_bytes: fileStats.size,
		obligatoria: Boolean(manifest.obligatoria),
	};
}

router.get('/latest', async (request, response) => {
	try {
		const device = await getDevice(request);
		if (!device) return response.status(401).json({ error: 'Clave de dispositivo inválida.' });
		const firmware = readPublishedFirmware();
		if (!firmware) return response.status(204).end();
		return response.json({ ...firmware, url: '/api/firmware/download' });
	} catch (error) {
		console.error('Firmware manifest failed:', error.message);
		return response.status(500).json({ error: 'No fue posible consultar actualizaciones.' });
	}
});

router.get('/download', async (request, response) => {
	try {
		const device = await getDevice(request);
		if (!device) return response.status(401).json({ error: 'Clave de dispositivo inválida.' });
		if (!readPublishedFirmware()) return response.status(404).json({ error: 'No hay firmware publicado.' });
		return response.sendFile(firmwarePath);
	} catch (error) {
		console.error('Firmware download failed:', error.message);
		return response.status(500).json({ error: 'No fue posible descargar el firmware.' });
	}
});

router.get('/download-inicial', (request, response) => {
	try {
		if (!readPublishedFirmware()) return response.status(404).json({ error: 'No hay firmware publicado.' });
		return response.download(firmwarePath, 'firmware.bin');
	} catch (error) {
		console.error('Initial firmware download failed:', error.message);
		return response.status(500).json({ error: 'No fue posible descargar el firmware inicial.' });
	}
});

router.get('/status', async (request, response) => {
	if (!hasRegistrationAccess(request)) return response.status(401).json({ error: 'Clave de registro inválida.' });
	try {
		return response.json(readPublishedFirmware() || { disponible: false });
	} catch (error) {
		return response.status(500).json({ error: error.message });
	}
});

module.exports = router;
