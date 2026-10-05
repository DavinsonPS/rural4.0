const lecturasRepo = require('../repositories/lecturas.repo');
const dispositivosRepo = require('../repositories/dispositivos.repo');
const { HISTORIAL_LECTURAS_LIMITE, TEMPERATURA_MIN, TEMPERATURA_MAX } = require('../config/catalogos');
const { ValidationError, ForbiddenError } = require('../lib/errors');

function isEmpty(value) {
	return value === null || value === undefined || value === '';
}

function validNumber(value) {
	return isEmpty(value) || Number.isFinite(Number(value));
}

function validTemperature(value) {
	return isEmpty(value) || (Number.isFinite(Number(value)) && Number(value) >= TEMPERATURA_MIN && Number(value) <= TEMPERATURA_MAX);
}

function isZero(value) {
	return !isEmpty(value) && Number(value) === 0;
}

// El firmware envía 0 cuando un sensor no está conectado. Temperatura y humedad del aire
// vienen del mismo sensor: si ambas son 0, ese sensor está desconectado.
function isAmbientSensorOff(reading) {
	return isZero(reading?.temperatura_c) && isZero(reading?.humedad_ambiente_pct);
}

function isAllZero(reading) {
	return isAmbientSensorOff(reading) && isZero(reading.humedad_suelo_pct) && isZero(reading.intensidad_luz_lux);
}

// Convierte los 0 de sensores desconectados en "sin dato" para no graficar 0 °C falsos.
// La BD conserva el valor original.
function clean(reading) {
	if (!reading) return reading;
	if (isAllZero(reading)) {
		return { ...reading, temperatura_c: null, humedad_ambiente_pct: null, humedad_suelo_pct: null, intensidad_luz_lux: null, sensor_desconectado: true };
	}
	if (isAmbientSensorOff(reading)) {
		return { ...reading, temperatura_c: null, humedad_ambiente_pct: null, sensor_ambiente_desconectado: true };
	}
	return reading;
}

async function record(device, body = {}) {
	if (device.es_camara) throw new ForbiddenError('Este dispositivo está vinculado como cámara y no puede enviar lecturas de sensores.');
	if (!body.fecha_lectura || !validTemperature(body.temperatura_c) || !validNumber(body.humedad_ambiente_pct)
		|| !validNumber(body.humedad_suelo_pct) || !validNumber(body.intensidad_luz_lux)) {
		throw new ValidationError('Fecha o medición inválida.');
	}
	await lecturasRepo.insert({
		idProyecto: device.id_proyecto,
		idDispositivo: device.id,
		fechaLectura: body.fecha_lectura,
		temperatura: body.temperatura_c,
		humedadAmbiente: body.humedad_ambiente_pct,
		humedadSuelo: body.humedad_suelo_pct,
		luz: body.intensidad_luz_lux ?? null,
	});
	await dispositivosRepo.touchContact(device.id);
	return { status: 'ok', intensidad_luz_lux: body.intensidad_luz_lux ?? null };
}

async function history(projectId) {
	const rows = await lecturasRepo.listRecent(projectId, HISTORIAL_LECTURAS_LIMITE);
	return rows.reverse().map(clean);
}

async function latest(projectId) {
	return clean(await lecturasRepo.findLatest(projectId));
}

module.exports = { record, history, latest, clean, isAllZero, isAmbientSensorOff, validNumber, validTemperature };
