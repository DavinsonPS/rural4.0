const crypto = require('node:crypto');
const dispositivosRepo = require('../repositories/dispositivos.repo');
const proyectosRepo = require('../repositories/proyectos.repo');
const proyectosService = require('./proyectos.service');
const { withTransaction } = require('../repositories/transaccion');
const { audit } = require('./auditoria.service');
const { canManage } = require('../policies/proyectos.policy');
const catalogos = require('../config/catalogos');
const { ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../lib/errors');
const { text } = require('../lib/http');

function createLinkCode() {
	return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function createApiKey() {
	const apiKey = crypto.randomBytes(32).toString('hex');
	return { apiKey, apiKeyHash: crypto.createHash('sha256').update(apiKey).digest('hex') };
}

// Aprovisionamiento automático desde el firmware (X-Provisioning-Key).
async function provision(body = {}) {
	const macAddress = text(body.mac_address).toUpperCase() || null;
	const serial = text(body.serial) || null;
	const codigoInterno = text(body.codigo_interno) || (macAddress ? `RURAL-${macAddress.replaceAll(':', '').slice(-6)}` : '');
	const modelo = text(body.modelo) || 'ESP32';
	const versionFirmware = text(body.version_firmware) || null;
	if (!codigoInterno || (!macAddress && !serial)) throw new ValidationError('La provisión requiere MAC o serial.');

	const existing = await dispositivosRepo.findByIdentifiers({ serial, macAddress });
	const { apiKey, apiKeyHash } = createApiKey();
	if (existing) {
		// Un dispositivo desactivado por el administrador no se reactiva solo al reprovisionarse.
		if (!Number(existing.estado)) throw new ForbiddenError('Dispositivo desactivado por el administrador.');
		// Un dispositivo que ya está vinculado no vuelve a quedar "pendiente" con código nuevo.
		const linked = await dispositivosRepo.findLinkedProject(existing.id);
		const codigoVinculacion = linked ? null : existing.codigo_vinculacion || createLinkCode();
		await dispositivosRepo.updateIdentity(existing.id, { codigoInterno, serial, macAddress, modelo, versionFirmware, codigoVinculacion, apiKeyHash });
		return { status: 200, body: { id: existing.id, codigo_interno: codigoInterno, codigo_vinculacion: codigoVinculacion, api_key: apiKey, nuevo: false } };
	}
	const codigoVinculacion = createLinkCode();
	const id = await dispositivosRepo.insert({ codigoInterno, serial, macAddress, modelo, versionFirmware, codigoVinculacion, apiKeyHash });
	return { status: 201, body: { id, codigo_interno: codigoInterno, codigo_vinculacion: codigoVinculacion, api_key: apiKey, nuevo: true } };
}

async function listPending() {
	return dispositivosRepo.listPending(catalogos.PENDIENTES_VENTANA_HORAS);
}

// Registro manual desde el dashboard. Si el equipo ya está vinculado a un proyecto que el
// usuario no gestiona, no se le permite reemplazar su API key.
async function register(actor, body = {}) {
	const device = {
		codigoInterno: text(body.codigo_interno),
		serial: text(body.serial) || null,
		macAddress: text(body.mac_address).toUpperCase() || null,
		modelo: text(body.modelo) || null,
		fabricante: text(body.fabricante) || null,
		versionFirmware: text(body.version_firmware) || null,
	};
	if (!device.codigoInterno || (!device.serial && !device.macAddress)) {
		throw new ValidationError('codigo_interno y MAC o serial son obligatorios.');
	}
	const existing = await dispositivosRepo.findByIdentifiers(device);
	const { apiKey, apiKeyHash } = createApiKey();
	if (existing) {
		if (!Number(existing.estado)) throw new ForbiddenError('Dispositivo desactivado por el administrador.');
		const linked = await dispositivosRepo.findLinkedProject(existing.id);
		if (linked && !canManage(actor, linked)) throw new ConflictError('El dispositivo ya está vinculado a otro proyecto activo.');
		const codigoVinculacion = existing.codigo_vinculacion || createLinkCode();
		await dispositivosRepo.updateIdentity(existing.id, { ...device, codigoVinculacion, apiKeyHash });
		await audit(actor, 'dispositivo.registrar', 'dispositivo', existing.id);
		return { status: 200, body: { id: existing.id, codigo_vinculacion: codigoVinculacion, api_key: apiKey, nuevo: false } };
	}
	const codigoVinculacion = createLinkCode();
	const id = await dispositivosRepo.insert({ ...device, codigoVinculacion, apiKeyHash });
	await audit(actor, 'dispositivo.registrar', 'dispositivo', id);
	return { status: 201, body: { id, codigo_interno: device.codigoInterno, codigo_vinculacion: codigoVinculacion, api_key: apiKey, nuevo: true } };
}

function configurationFor(device) {
	return {
		dispositivo_id: device.id,
		codigo_interno: device.codigo_interno,
		proyecto_id: device.id_proyecto,
		nombre_proyecto: device.nombre_proyecto || null,
		tipo_dispositivo: device.tipo_dispositivo,
		configuracion_led: device.configuracion_led || 'maxima',
		color_led: device.color_led || 'rojo',
		brillo_led: Number(device.brillo_led ?? 255),
		tipo_tierra: device.tipo_tierra || null,
	};
}

async function projectStatus(actor, projectId) {
	const project = await proyectosService.loadFor(actor, projectId, 'view');
	const details = await proyectosRepo.findSummaryById(project.id);
	if (!details) throw new NotFoundError('Proyecto no encontrado.');
	return {
		proyecto_id: details.id,
		dispositivo_vinculado: Boolean(details.id_dispositivo),
		dispositivo: details.id_dispositivo ? {
			id: details.id_dispositivo,
			codigo_interno: details.codigo_interno,
			mac_address: details.mac_address,
			modelo: details.modelo,
			fecha_ultimo_contacto: details.fecha_ultimo_contacto,
		} : null,
		dispositivo_camara_vinculado: Boolean(details.id_dispositivo_camara),
		dispositivo_camara: details.id_dispositivo_camara ? {
			id: details.id_dispositivo_camara,
			codigo_interno: details.camera_codigo_interno,
			mac_address: details.camera_mac_address,
			modelo: details.camera_modelo,
			fecha_ultimo_contacto: details.camera_fecha_ultimo_contacto,
		} : null,
	};
}

function readLed(body = {}, { requireSoil }) {
	const led = {
		configuracion: text(body.configuracion_led) || 'maxima',
		color: text(body.color_led) || 'rojo',
		brillo: Number(body.brillo_led),
		tierra: text(body.tipo_tierra) || null,
	};
	const valid = catalogos.LED_CONFIGURACIONES.includes(led.configuracion)
		&& catalogos.LED_COLORES.includes(led.color)
		&& Number.isInteger(led.brillo) && led.brillo >= 0 && led.brillo <= 255
		&& (led.tierra ? catalogos.TIPOS_TIERRA.includes(led.tierra) : !requireSoil);
	return valid ? led : null;
}

async function link(actor, projectId, body = {}) {
	const codigoInterno = text(body.codigo_interno);
	const codigoVinculacion = text(body.codigo_vinculacion).toUpperCase();
	const deviceType = text(body.tipo_dispositivo) || 'sensor';
	const isCamera = deviceType === 'camara';
	const led = isCamera ? null : readLed(body, { requireSoil: true });
	if (!codigoInterno || !codigoVinculacion || !catalogos.TIPOS_DISPOSITIVO.includes(deviceType) || (!isCamera && !led)) {
		throw new ValidationError('Los datos del dispositivo o su configuración son inválidos.');
	}
	const project = await proyectosService.loadFor(actor, projectId, 'manage');

	try {
		const deviceId = await withTransaction(async (connection) => {
			const device = await dispositivosRepo.findForLinking(connection, codigoInterno, codigoVinculacion);
			if (!device) throw new NotFoundError('Dispositivo no encontrado o código de vinculación inválido.');
			const model = text(device.modelo).toUpperCase();
			if (isCamera !== (model === catalogos.MODELO_CAMARA)) {
				throw new ConflictError(`El modelo ${model || 'sin definir'} no corresponde al tipo ${isCamera ? 'cámara' : 'sensores'} seleccionado.`);
			}
			const slots = await dispositivosRepo.lockProjectSlots(connection, project.id);
			if (!slots) throw new NotFoundError('Proyecto no encontrado o inactivo.');
			const otherSlotDevice = isCamera ? slots.id_dispositivo : slots.id_dispositivo_camara;
			if (Number(otherSlotDevice) === Number(device.id)) throw new ConflictError('Un mismo dispositivo no puede ocupar ambos slots del proyecto.');
			const other = await dispositivosRepo.findOtherAssignment(connection, device.id, project.id);
			if (other) throw new ConflictError(`El dispositivo ya está vinculado al proyecto "${other.nombre}".`);
			const assigned = isCamera
				? await dispositivosRepo.assignCamera(connection, project.id, device.id)
				: await dispositivosRepo.assignSensor(connection, project.id, device.id, led);
			if (!assigned) throw new ConflictError(`El proyecto no existe, está inactivo o ya tiene un dispositivo de ${isCamera ? 'cámara' : 'sensores'}.`);
			await dispositivosRepo.markLinked(connection, device.id);
			return device.id;
		});
		await audit(actor, 'dispositivo.vincular', 'proyecto', project.id, { dispositivo: deviceId, tipo: deviceType });
		return {
			status: 'ok',
			tipo_dispositivo: deviceType,
			dispositivo_id: deviceId,
			proyecto_id: project.id,
			...(isCamera ? {} : {
				configuracion_led: led.configuracion,
				color_led: led.color,
				brillo_led: led.brillo,
				tipo_tierra: led.tierra,
			}),
		};
	} catch (error) {
		if (error.code === 'ER_DUP_ENTRY' && String(error.sqlMessage || '').includes('uk_tblh_proyectos_dispositivo')) {
			throw new ConflictError('El dispositivo ya está vinculado a otro proyecto activo.');
		}
		throw error;
	}
}

async function configureLed(actor, projectId, body = {}) {
	const led = readLed(body, { requireSoil: false });
	if (!led) throw new ValidationError('Configuración LED inválida.');
	const project = await proyectosService.loadFor(actor, projectId, 'manage');
	if (!await dispositivosRepo.updateLedConfiguration(project.id, led)) throw new NotFoundError('Proyecto no encontrado o inactivo.');
	await audit(actor, 'proyecto.configurar_led', 'proyecto', project.id, led);
	return { status: 'ok', configuracion_led: led.configuracion, color_led: led.color, brillo_led: led.brillo, tipo_tierra: led.tierra };
}

async function unlink(actor, projectId, deviceTypeValue) {
	const deviceType = text(deviceTypeValue) || 'sensor';
	if (!catalogos.TIPOS_DISPOSITIVO.includes(deviceType)) throw new ValidationError('Tipo de dispositivo inválido.');
	const project = await proyectosService.loadFor(actor, projectId, 'manage');
	const deviceId = await withTransaction(async (connection) => {
		const slots = await dispositivosRepo.lockProjectSlots(connection, project.id);
		if (!slots) throw new NotFoundError('Proyecto no encontrado o inactivo.');
		const linkedDeviceId = deviceType === 'camara' ? slots.id_dispositivo_camara : slots.id_dispositivo;
		if (deviceType === 'camara') await dispositivosRepo.releaseCamera(connection, project.id);
		else await dispositivosRepo.releaseSensor(connection, project.id);
		if (linkedDeviceId) await dispositivosRepo.markUnlinked(connection, linkedDeviceId);
		return linkedDeviceId;
	});
	await audit(actor, 'dispositivo.desvincular', 'proyecto', project.id, { dispositivo: deviceId, tipo: deviceType });
	return { status: 'ok', proyecto_id: project.id, tipo_dispositivo: deviceType, dispositivo_desvinculado: Boolean(deviceId) };
}

module.exports = { provision, listPending, register, configurationFor, projectStatus, link, configureLed, unlink };
