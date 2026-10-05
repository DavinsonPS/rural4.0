const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { requireDevice } = require('../middlewares/device-auth');
const { hasRegistrationKey } = require('../middlewares/auth');
const { normalize, typeFor, typeForModel, paths, readPublishedFirmware } = require('../services/firmware.service');

// Rutas que usa el firmware del ESP32 para OTA y primera instalación: no cambiar URL ni headers.
// El OTA se elige por el modelo del dispositivo que pregunta (sensor o ESP32-CAMERA).
// La primera instalación se elige con ?tipo=camara; sin parámetro es la del sensor, como antes.
const router = express.Router();
const firstInstallFiles = new Set([
	'first-flash.bin',
	'bootloader.bin',
	'partitions.bin',
	'boot_app0.bin',
	'application.bin',
]);

router.get('/latest', requireDevice(), async (request, response) => {
	try {
		const firmware = readPublishedFirmware(typeForModel(request.device.modelo));
		if (!firmware) return response.status(204).end();
		return response.json({ ...firmware, url: '/api/firmware/download' });
	} catch (error) {
		console.error('Firmware manifest failed:', error.message);
		return response.status(500).json({ error: 'No fue posible consultar actualizaciones.' });
	}
});

router.get('/download', requireDevice(), async (request, response) => {
	try {
		const type = typeForModel(request.device.modelo);
		if (!readPublishedFirmware(type)) return response.status(404).json({ error: 'No hay firmware publicado.' });
		return response.sendFile(paths(type).firmwarePath);
	} catch (error) {
		console.error('Firmware download failed:', error.message);
		return response.status(500).json({ error: 'No fue posible descargar el firmware.' });
	}
});

router.get('/download-inicial', (request, response) => {
	try {
		const firstFlashPath = path.join(paths(typeFor(request.query.tipo)).firstInstallDirectory, 'first-flash.bin');
		if (!fs.existsSync(firstFlashPath)) return response.status(404).json({ error: 'No hay imagen de primera instalación.' });
		return response.download(firstFlashPath, typeFor(request.query.tipo) === 'camara' ? 'first-flash-camara.bin' : 'first-flash.bin');
	} catch (error) {
		console.error('Initial firmware download failed:', error.message);
		return response.status(500).json({ error: 'No fue posible descargar el firmware inicial.' });
	}
});

router.get('/first-install/manifest', (request, response) => {
	const initialManifestPath = path.join(paths(typeFor(request.query.tipo)).firstInstallDirectory, 'manifest.json');
	if (!fs.existsSync(initialManifestPath)) return response.status(404).json({ error: 'No hay manifiesto de primera instalación.' });
	return response.sendFile(initialManifestPath);
});

router.get('/first-install/files/:filename', (request, response) => {
	const filename = normalize(request.params.filename);
	if (!firstInstallFiles.has(filename)) return response.status(404).json({ error: 'Archivo de instalación no encontrado.' });
	const filePath = path.join(paths(typeFor(request.query.tipo)).firstInstallDirectory, filename);
	if (!fs.existsSync(filePath)) return response.status(404).json({ error: 'Archivo de instalación no encontrado.' });
	return response.download(filePath, filename);
});

router.get('/status', async (request, response) => {
	if (!hasRegistrationKey(request)) return response.status(401).json({ error: 'Clave de registro inválida.' });
	try {
		return response.json(readPublishedFirmware(typeFor(request.query.tipo)) || { disponible: false });
	} catch (error) {
		return response.status(500).json({ error: error.message });
	}
});

module.exports = router;
