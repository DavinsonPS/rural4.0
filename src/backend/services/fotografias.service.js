const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const fotografiasRepo = require('../repositories/fotografias.repo');
const bitacorasRepo = require('../repositories/bitacoras.repo');
const dispositivosRepo = require('../repositories/dispositivos.repo');
const proyectosRepo = require('../repositories/proyectos.repo');
const proyectosService = require('./proyectos.service');
const { audit } = require('./auditoria.service');
const { assertCan, canSupervise } = require('../policies/proyectos.policy');
const { ValidationError, ForbiddenError, NotFoundError } = require('../lib/errors');
const { positiveInteger } = require('../lib/http');
const { toMysqlDateTime, toColombiaDate } = require('../lib/fechas');

const backendDirectory = path.join(__dirname, '..');
const photoDirectory = path.join(backendDirectory, 'uploads', 'photos');

const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function publicUrl(relativePath) {
	return `/${relativePath}`.replace('/uploads/uploads/', '/uploads/');
}

// Decide a qué proyecto va la foto: la cámara vinculada usa su propio proyecto; desde la
// web, solo el estudiante dueño puede subir fotos a su proyecto.
async function resolveTarget({ actor, device, requestedProjectId }) {
	const requested = positiveInteger(requestedProjectId);
	if (device) {
		if (device.es_sensor) throw new ForbiddenError('Esta clave pertenece al ESP32 de sensores; vincula la ESP32-CAMERA para enviar fotos.');
		if (requested && requested !== Number(device.id_proyecto)) throw new NotFoundError('Proyecto no encontrado.');
		return { projectId: Number(device.id_proyecto), deviceId: device.id };
	}
	if (!requested) throw new ValidationError('Se requiere una clave de cámara vinculada o un proyecto válido.');
	const project = await proyectosService.loadFor(actor, requested, 'record');
	return { projectId: project.id, deviceId: null };
}

async function markPhotoChallenge(projectId, date) {
	const log = await bitacorasRepo.findActiveForDate(projectId, date);
	if (!log) return;
	let completedChallenges = [];
	try {
		completedChallenges = JSON.parse(log.retos_completados || '[]');
	} catch {
		completedChallenges = [];
	}
	if (!Array.isArray(completedChallenges)) completedChallenges = [];
	if (completedChallenges.includes('foto')) return;
	completedChallenges.push('foto');
	await bitacorasRepo.setChallenges(log.id, JSON.stringify(completedChallenges));
}

// photo: { buffer } para JPEG crudo de la cámara, o { tempPath, mimetype, size } desde multer.
async function upload({ actor, device, requestedProjectId, photo, fechaFotografia, fechaBitacora }) {
	const { projectId, deviceId } = await resolveTarget({ actor, device, requestedProjectId });
	if (!photo) throw new ValidationError('La foto JPEG es obligatoria.');
	if (photo.buffer && !photo.buffer.length) throw new ValidationError('La foto JPEG está vacía.');
	const photoDateTime = toMysqlDateTime(fechaFotografia || new Date());
	if (!photoDateTime) throw new ValidationError('La fecha de la fotografía es inválida.');

	const now = new Date();
	const folder = path.join(photoDirectory, String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'));
	fs.mkdirSync(folder, { recursive: true });
	const extension = photo.buffer ? 'jpg' : extensions[photo.mimetype] || 'jpg';
	const fileName = `${projectId}_${now.toISOString().replace(/[:.]/g, '-')}_${crypto.randomBytes(4).toString('hex')}.${extension}`;
	const finalPath = path.join(folder, fileName);
	if (photo.buffer) fs.writeFileSync(finalPath, photo.buffer);
	else fs.renameSync(photo.tempPath, finalPath);

	const relativePath = path.relative(backendDirectory, finalPath).replaceAll(path.sep, '/');
	try {
		await fotografiasRepo.insert({
			idProyecto: projectId,
			idDispositivo: deviceId,
			fechaFotografia: photoDateTime,
			rutaArchivo: relativePath,
			nombreArchivo: fileName,
			tamanoBytes: photo.buffer ? photo.buffer.length : photo.size,
		});
	} catch (error) {
		fs.rmSync(finalPath, { force: true });
		throw error;
	}
	if (deviceId) await dispositivosRepo.touchContact(deviceId);
	// Solo la foto que sube el estudiante cuenta como su reto "foto"; la de la cámara es automática.
	const challengeDate = String(fechaBitacora || fechaFotografia || toColombiaDate(now)).slice(0, 10);
	if (!deviceId && /^\d{4}-\d{2}-\d{2}$/.test(challengeDate)) await markPhotoChallenge(projectId, challengeDate);
	return { status: 'ok', ruta: `/uploads/${relativePath.replace('uploads/', '')}` };
}

async function list(actor, projectId, originValue) {
	const project = await proyectosService.loadFor(actor, projectId, 'view');
	const includeHidden = canSupervise(actor, project);
	const origin = ['estudiante', 'camara'].includes(originValue) ? originValue : null;
	const rows = await fotografiasRepo.listByProject(project.id, includeHidden, origin);
	return rows.map(({ estado, ...photo }) => ({
		...photo,
		url: publicUrl(photo.ruta_archivo),
		...(includeHidden ? { oculta: Number(estado) === 0 } : {}),
	}));
}

async function setHidden(actor, photoIdValue, hidden) {
	const photoId = positiveInteger(photoIdValue);
	if (!photoId) throw new ValidationError('Fotografía inválida.');
	const photo = await fotografiasRepo.findById(photoId);
	if (!photo) throw new NotFoundError('Fotografía no encontrada.');
	const project = await proyectosRepo.findActiveById(photo.id_proyecto);
	assertCan('supervise', actor, project);
	await fotografiasRepo.setVisible(photo.id, !hidden);
	await audit(actor, hidden ? 'foto.ocultar' : 'foto.mostrar', 'fotografia', photo.id, { id_proyecto: photo.id_proyecto });
	return { id: photo.id, oculta: Boolean(hidden) };
}

const TIMELAPSE_RANGES = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30, todo: null };
const TIMELAPSE_MAX_FRAMES = 400;

// Toma `count` elementos repartidos de forma pareja, conservando siempre el primero y el último.
function sampleEvenly(items, count) {
	if (items.length <= count) return items;
	const step = (items.length - 1) / (count - 1);
	return Array.from({ length: count }, (_, index) => items[Math.round(index * step)]);
}

// Timelapse del proyecto con las fotos de la cámara. Con una foto por minuto hay miles de
// fotos por semana: se muestrean hasta TIMELAPSE_MAX_FRAMES cuadros repartidos en el periodo.
async function timelapse(actor, projectId, rangeValue, maxValue) {
	const project = await proyectosService.loadFor(actor, projectId, 'view');
	const range = Object.hasOwn(TIMELAPSE_RANGES, rangeValue) ? rangeValue : '7d';
	const max = Math.min(Math.max(positiveInteger(maxValue) || 240, 10), TIMELAPSE_MAX_FRAMES);
	const frames = await fotografiasRepo.listCameraFrames(project.id, TIMELAPSE_RANGES[range]);
	return {
		rango: range,
		total: frames.length,
		cuadros: sampleEvenly(frames, max).map((frame) => ({ id: frame.id, fecha: frame.fecha, url: publicUrl(frame.ruta_archivo) })),
	};
}

module.exports = { photoDirectory, upload, list, setHidden, timelapse, sampleEvenly };
