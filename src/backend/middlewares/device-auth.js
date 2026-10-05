const crypto = require('node:crypto');
const dispositivosRepo = require('../repositories/dispositivos.repo');
const { UnauthorizedError } = require('../lib/errors');

function deviceKey(request) {
	return String(request.get('x-device-key') || '').trim();
}

async function authenticateDevice(request) {
	const key = deviceKey(request);
	if (!key) return null;
	const keyHash = crypto.createHash('sha256').update(key).digest('hex');
	const device = await dispositivosRepo.findByApiKeyHash(keyHash);
	if (!device) return null;
	return {
		...device,
		es_sensor: Boolean(device.id_proyecto_sensor),
		es_camara: Boolean(device.id_proyecto_camara),
	};
}

// linked: true exige que el dispositivo esté vinculado a un proyecto activo.
function requireDevice({ linked = false } = {}) {
	return async (request, response, next) => {
		try {
			const device = await authenticateDevice(request);
			if (!device || (linked && !device.id_proyecto)) return next(new UnauthorizedError('Clave de dispositivo inválida.'));
			request.device = device;
			return next();
		} catch (error) {
			error.failureMessage = 'No fue posible validar el dispositivo.';
			return next(error);
		}
	};
}

module.exports = { deviceKey, authenticateDevice, requireDevice };
