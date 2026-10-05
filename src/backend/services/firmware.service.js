const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Firmware publicado por tipo de dispositivo. Cada tipo tiene su OTA (firmware.bin +
// manifest.json) y su imagen de primera instalación (first-install/). Así una ESP32-CAMERA
// nunca recibe el programa del sensor, ni al revés.
//
//   esp32-firmware/                 ← sensor (ubicación original, no cambia)
//   esp32-firmware/camara/          ← ESP32-CAMERA
const baseDirectory = path.join(__dirname, '..', 'esp32-firmware');
const TYPES = ['sensor', 'camara'];
const CAMERA_MODEL = 'ESP32-CAMERA';

function normalize(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function typeFor(value) {
	return normalize(value).toLowerCase() === 'camara' ? 'camara' : 'sensor';
}

function typeForModel(model) {
	return normalize(model).toUpperCase() === CAMERA_MODEL ? 'camara' : 'sensor';
}

function paths(type) {
	const directory = type === 'camara' ? path.join(baseDirectory, 'camara') : baseDirectory;
	return {
		firmwarePath: path.join(directory, 'firmware.bin'),
		manifestPath: path.join(directory, 'manifest.json'),
		firstInstallDirectory: path.join(directory, 'first-install'),
	};
}

function readPublishedFirmware(type = 'sensor') {
	const { firmwarePath, manifestPath } = paths(type);
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

// Para el resumen del administrador: nunca lanza, informa el problema.
function firmwareStatus(type = 'sensor') {
	try {
		const firmware = readPublishedFirmware(type);
		return firmware ? { disponible: true, ...firmware, fecha: fs.statSync(paths(type).firmwarePath).mtime } : { disponible: false };
	} catch (error) {
		return { disponible: false, error: error.message };
	}
}

module.exports = { TYPES, normalize, typeFor, typeForModel, paths, readPublishedFirmware, firmwareStatus };
