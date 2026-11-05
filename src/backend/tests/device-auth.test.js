const assert = require('node:assert/strict');
const test = require('node:test');
require('./helpers');
const dispositivosRepo = require('../repositories/dispositivos.repo');
const { requireDevice } = require('../middlewares/device-auth');
const { startApp } = require('./helpers');

test('registra la versión reportada por un dispositivo autenticado', async () => {
	const originalFind = dispositivosRepo.findByApiKeyHash;
	const originalUpdate = dispositivosRepo.updateFirmwareVersion;
	const device = { id: 8, version_firmware: '1.0.2' };
	const updates = [];
	dispositivosRepo.findByApiKeyHash = async () => device;
	dispositivosRepo.updateFirmwareVersion = async (...args) => updates.push(args);
	try {
		const request = { get: (name) => ({ 'x-device-key': 'secret', 'x-firmware-version': '1.0.3' }[name.toLowerCase()]) };
		let nextError;
		await requireDevice()(request, {}, (error) => { nextError = error; });
		assert.equal(nextError, undefined);
		assert.deepEqual(updates, [[8, '1.0.3']]);
		assert.equal(request.device.version_firmware, '1.0.3');
	} finally {
		dispositivosRepo.findByApiKeyHash = originalFind;
		dispositivosRepo.updateFirmwareVersion = originalUpdate;
	}
});

test('ignora versiones inválidas y conserva la versión registrada', async () => {
	const originalFind = dispositivosRepo.findByApiKeyHash;
	const originalUpdate = dispositivosRepo.updateFirmwareVersion;
	const device = { id: 8, version_firmware: '1.0.2' };
	let updateCount = 0;
	dispositivosRepo.findByApiKeyHash = async () => device;
	dispositivosRepo.updateFirmwareVersion = async () => { updateCount++; };
	try {
		const request = { get: (name) => ({ 'x-device-key': 'secret', 'x-firmware-version': '1.0.invalid' }[name.toLowerCase()]) };
		let nextError;
		await requireDevice()(request, {}, (error) => { nextError = error; });
		assert.equal(nextError, undefined);
		assert.equal(updateCount, 0);
		assert.equal(request.device.version_firmware, '1.0.2');
	} finally {
		dispositivosRepo.findByApiKeyHash = originalFind;
		dispositivosRepo.updateFirmwareVersion = originalUpdate;
	}
});

test('el endpoint de reporte confirma la versión persistida para el dispositivo', async () => {
	const originalFind = dispositivosRepo.findByApiKeyHash;
	const originalUpdate = dispositivosRepo.updateFirmwareVersion;
	const device = { id: 8, version_firmware: '1.0.2' };
	const updates = [];
	dispositivosRepo.findByApiKeyHash = async () => device;
	dispositivosRepo.updateFirmwareVersion = async (id, version) => {
		updates.push([id, version]);
		device.version_firmware = version;
	};
	const app = await startApp([['/api/dispositivos', require('../routes/devices.routes')]]);
	try {
		const response = await app.request('/api/dispositivos/version', {
			method: 'POST',
			headers: { 'x-device-key': 'secret', 'x-firmware-version': '1.0.3' },
		});
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), { version_firmware: '1.0.3' });
		assert.deepEqual(updates, [[8, '1.0.3']]);
	} finally {
		await app.close();
		dispositivosRepo.findByApiKeyHash = originalFind;
		dispositivosRepo.updateFirmwareVersion = originalUpdate;
	}
});
