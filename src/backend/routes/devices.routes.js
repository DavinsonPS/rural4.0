const express = require('express');
const dispositivosService = require('../services/dispositivos.service');
const { requireSessionOrRegistrationKey } = require('../middlewares/auth');
const { requireDevice } = require('../middlewares/device-auth');
const { UnauthorizedError } = require('../lib/errors');
const { handler } = require('../lib/http');

const router = express.Router();

function requireProvisioningKey(request, response, next) {
	const configuredKey = String(process.env.DEVICE_PROVISIONING_KEY || '').trim();
	if (configuredKey && request.get('x-provisioning-key') === configuredKey) return next();
	return next(new UnauthorizedError('Clave de provisión inválida o no configurada.'));
}

// --- Rutas que usa el firmware del ESP32: no cambiar URL ni headers ---

router.post('/provisionar', requireProvisioningKey, handler('No fue posible provisionar el dispositivo.', async (request, response) => {
	const result = await dispositivosService.provision(request.body);
	response.status(result.status).json(result.body);
}));

router.get('/configuracion', requireDevice(), handler('No fue posible consultar la configuración.', async (request, response) => {
	response.json(dispositivosService.configurationFor(request.device));
}));

// --- Rutas del dashboard: sesión del usuario (o X-Registration-Key para herramientas internas) ---

router.get('/pendientes', requireSessionOrRegistrationKey, handler('No fue posible consultar los dispositivos pendientes.', async (request, response) => {
	response.json(await dispositivosService.listPending());
}));

router.get('/proyectos/:projectId/estado', requireSessionOrRegistrationKey, handler('No fue posible consultar el dispositivo del proyecto.', async (request, response) => {
	response.json(await dispositivosService.projectStatus(request.user, request.params.projectId));
}));

router.post('/registrar', requireSessionOrRegistrationKey, handler('No fue posible registrar el dispositivo.', async (request, response) => {
	const result = await dispositivosService.register(request.user, request.body);
	response.status(result.status).json(result.body);
}));

router.post('/proyectos/:projectId/vincular', requireSessionOrRegistrationKey, handler('No fue posible vincular el dispositivo.', async (request, response) => {
	response.json(await dispositivosService.link(request.user, request.params.projectId, request.body));
}));

router.post('/proyectos/:projectId/configuracion', requireSessionOrRegistrationKey, handler('No fue posible guardar la configuración LED.', async (request, response) => {
	response.json(await dispositivosService.configureLed(request.user, request.params.projectId, request.body));
}));

router.delete('/proyectos/:projectId', requireSessionOrRegistrationKey, handler('No fue posible desvincular el dispositivo.', async (request, response) => {
	const deviceType = request.query.tipo_dispositivo || request.body?.tipo_dispositivo;
	response.json(await dispositivosService.unlink(request.user, request.params.projectId, deviceType));
}));

module.exports = router;
