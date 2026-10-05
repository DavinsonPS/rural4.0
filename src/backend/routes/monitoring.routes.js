const fs = require('node:fs');
const express = require('express');
const multer = require('multer');
const lecturasService = require('../services/lecturas.service');
const bitacorasService = require('../services/bitacoras.service');
const fotografiasService = require('../services/fotografias.service');
const { requireSession } = require('../middlewares/auth');
const { requireDevice, authenticateDevice, deviceKey } = require('../middlewares/device-auth');
const { UnauthorizedError } = require('../lib/errors');
const { handler } = require('../lib/http');

const router = express.Router();
fs.mkdirSync(fotografiasService.photoDirectory, { recursive: true });
const upload = multer({
	dest: fotografiasService.photoDirectory,
	limits: { fileSize: 8 * 1024 * 1024 },
	fileFilter: (request, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});
const uploadRawJpeg = express.raw({ type: 'image/jpeg', limit: '8mb' });

// Lecturas del ESP32 de sensores (URL y header usados por el firmware: no cambiar).
router.post('/lecturas', requireDevice({ linked: true }), handler('No fue posible guardar la lectura.', async (request, response) => {
	response.status(201).json(await lecturasService.record(request.device, request.body));
}));

router.get('/bitacoras', requireSession, handler('No fue posible consultar las bitácoras.', async (request, response) => {
	response.json(await bitacorasService.list(request.user, request.query.id_proyecto));
}));

router.post('/bitacoras', requireSession, handler('No fue posible guardar la bitácora.', async (request, response) => {
	response.status(201).json(await bitacorasService.save(request.user, request.body));
}));

router.put('/bitacoras/:logId', requireSession, handler('No fue posible actualizar la bitácora.', async (request, response) => {
	response.json(await bitacorasService.update(request.user, request.params.logId, request.body));
}));

router.delete('/bitacoras/:logId', requireSession, handler('No fue posible eliminar la bitácora.', async (request, response) => {
	response.json(await bitacorasService.remove(request.user, request.params.logId));
}));

// Quién sube la foto se decide antes de leer el archivo: la ESP32-CAMERA con X-Device-Key
// (URL usada por el firmware) o el estudiante con su sesión.
async function identifyUploader(request, response, next) {
	try {
		if (deviceKey(request)) {
			const device = await authenticateDevice(request);
			if (!device || !device.id_proyecto) return next(new UnauthorizedError('Clave de dispositivo inválida.'));
			request.device = device;
			return next();
		}
		return requireSession(request, response, next);
	} catch (error) {
		error.failureMessage = 'No fue posible guardar la fotografía.';
		return next(error);
	}
}

function parsePhotoUpload(request, response, next) {
	if (request.is('image/jpeg')) return uploadRawJpeg(request, response, next);
	return upload.single('foto')(request, response, next);
}

// El archivo temporal de multer se elimina siempre que no haya terminado en su carpeta final.
function removeTemporaryUpload(request) {
	if (request.file?.path) fs.rmSync(request.file.path, { force: true });
}

router.post('/fotografias', identifyUploader, parsePhotoUpload, async (request, response, next) => {
	try {
		const rawJpeg = Buffer.isBuffer(request.body);
		const body = rawJpeg ? {} : request.body || {};
		const result = await fotografiasService.upload({
			actor: request.user,
			device: request.device,
			requestedProjectId: body.id_proyecto,
			photo: rawJpeg
				? { buffer: request.body }
				: request.file ? { tempPath: request.file.path, mimetype: request.file.mimetype, size: request.file.size } : null,
			fechaFotografia: body.fecha_fotografia,
			fechaBitacora: body.fecha_bitacora,
		});
		response.status(201).json(result);
	} catch (error) {
		error.failureMessage = 'No fue posible guardar la fotografía.';
		next(error);
	} finally {
		removeTemporaryUpload(request);
	}
});

router.get('/fotografias', requireSession, handler('No fue posible consultar las fotografías.', async (request, response) => {
	response.json(await fotografiasService.list(request.user, request.query.id_proyecto, request.query.origen));
}));

// Timelapse con las fotos de la ESP32-CAMERA: ?id_proyecto=&rango=24h|7d|30d|todo&max=
router.get('/timelapse', requireSession, handler('No fue posible armar el timelapse.', async (request, response) => {
	response.json(await fotografiasService.timelapse(request.user, request.query.id_proyecto, request.query.rango, request.query.max));
}));

module.exports = router;
