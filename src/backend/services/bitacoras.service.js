const bitacorasRepo = require('../repositories/bitacoras.repo');
const proyectosService = require('./proyectos.service');
const proyectosRepo = require('../repositories/proyectos.repo');
const { assertCan } = require('../policies/proyectos.policy');
const { validNumber, validTemperature } = require('./lecturas.service');
const { ValidationError, NotFoundError } = require('../lib/errors');
const { positiveInteger } = require('../lib/http');

function readChallenges(value) {
	return Array.isArray(value)
		? value.filter((challenge) => /^[a-z]+$/.test(String(challenge))).slice(0, 6)
		: null;
}

function readFields(body = {}) {
	const challenges = readChallenges(body.retos_completados);
	const fields = {
		temperatura_ambiente_c: body.temperatura_ambiente_c ?? null,
		agua_aplicada_ml: body.agua_aplicada_ml ?? null,
		hora_riego: String(body.hora_riego || '').trim() || null,
		humedad_suelo_pct: body.humedad_suelo_pct ?? null,
		color_hojas: String(body.color_hojas || '').trim().slice(0, 50) || null,
		observacion: String(body.observacion || '').trim().slice(0, 500) || null,
		retos_completados: challenges?.length ? JSON.stringify(challenges) : null,
	};
	if (!validTemperature(fields.temperatura_ambiente_c) || !validNumber(fields.agua_aplicada_ml) || !validNumber(fields.humedad_suelo_pct)
		|| (fields.hora_riego && !/^\d{2}:\d{2}(:\d{2})?$/.test(fields.hora_riego))) {
		throw new ValidationError('Los datos de la bitácora son inválidos.');
	}
	return fields;
}

async function list(actor, projectId) {
	const project = await proyectosService.loadFor(actor, projectId, 'view');
	return bitacorasRepo.listByProject(project.id);
}

async function save(actor, body = {}) {
	const date = String(body.fecha_bitacora || '').trim();
	if (!positiveInteger(body.id_proyecto) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		throw new ValidationError('Los datos de la bitácora son inválidos.');
	}
	const fields = readFields(body);
	const project = await proyectosService.loadFor(actor, body.id_proyecto, 'record');
	await bitacorasRepo.upsertForDate(project.id, date, fields);
	return { status: 'ok', fecha_bitacora: date };
}

// El proyecto se toma de la bitácora, no de lo que envía el cliente.
async function loadLogFor(actor, logIdValue) {
	const logId = positiveInteger(logIdValue);
	if (!logId) throw new ValidationError('Bitácora inválida.');
	const log = await bitacorasRepo.findActiveById(logId);
	if (!log) throw new NotFoundError('Bitácora no encontrada.');
	const project = await proyectosRepo.findActiveById(log.id_proyecto);
	assertCan('record', actor, project);
	return log;
}

async function update(actor, logId, body = {}) {
	const log = await loadLogFor(actor, logId);
	await bitacorasRepo.update(log.id, readFields(body));
	return { message: 'Bitácora actualizada correctamente.' };
}

async function remove(actor, logId) {
	const log = await loadLogFor(actor, logId);
	await bitacorasRepo.softDelete(log.id);
	return { message: 'Bitácora eliminada correctamente.' };
}

module.exports = { list, save, update, remove };
