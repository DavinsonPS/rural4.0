const assert = require('node:assert/strict');
const test = require('node:test');
const { startApp } = require('./helpers');
const dispositivosRepo = require('../repositories/dispositivos.repo');
const dispositivosService = require('../services/dispositivos.service');
const { sampleEvenly } = require('../services/fotografias.service');
const { typeForModel, typeFor } = require('../services/firmware.service');

test('el timelapse muestrea de forma pareja y conserva la primera y la última foto', () => {
	const frames = Array.from({ length: 1440 }, (_, index) => index);
	const sample = sampleEvenly(frames, 240);
	assert.equal(sample.length, 240);
	assert.equal(sample[0], 0);
	assert.equal(sample.at(-1), 1439);
	assert.deepEqual(sampleEvenly([1, 2, 3], 240), [1, 2, 3]);
});

test('el firmware se elige por modelo del dispositivo', () => {
	assert.equal(typeForModel('ESP32-CAMERA'), 'camara');
	assert.equal(typeForModel('esp32-camera'), 'camara');
	assert.equal(typeForModel('ESP32'), 'sensor');
	assert.equal(typeForModel(null), 'sensor');
	assert.equal(typeFor('camara'), 'camara');
	assert.equal(typeFor(undefined), 'sensor');
});

test('una ESP32-CAMERA nunca recibe el OTA del sensor', async () => {
	let model = 'ESP32-CAMERA';
	dispositivosRepo.findByApiKeyHash = async () => ({ id: 10, modelo: model, id_proyecto_camara: 2, id_proyecto: 2 });
	const app = await startApp([['/api/firmware', require('../routes/firmware.routes')]]);
	try {
		const camera = await app.request('/api/firmware/latest', { headers: { 'x-device-key': 'clave' } });
		assert.equal(camera.status, 204);
		assert.equal((await app.request('/api/firmware/download', { headers: { 'x-device-key': 'clave' } })).status, 404);
		model = 'ESP32';
		const sensor = await app.request('/api/firmware/latest', { headers: { 'x-device-key': 'clave' } });
		assert.equal(sensor.status, 200);
		assert.match((await sensor.json()).version, /^\d+\.\d+\.\d+$/);
		// Un archivo fuera de la lista permitida nunca se entrega, ni de sensor ni de cámara.
		assert.equal((await app.request('/api/firmware/first-install/files/..%2F.env?tipo=camara')).status, 404);
	} finally {
		await app.close();
	}
});

test('un dispositivo desactivado por el administrador no se reactiva al reprovisionarse', async () => {
	dispositivosRepo.findByIdentifiers = async () => ({ id: 5, codigo_vinculacion: null, estado: 0 });
	await assert.rejects(dispositivosService.provision({ mac_address: 'AA:BB:CC:DD:EE:FF', modelo: 'ESP32-CAMERA' }), { status: 403 });
});
