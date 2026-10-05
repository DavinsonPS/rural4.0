const express = require('express');
const adminService = require('../services/admin.service');
const { requireSession, requireRole } = require('../middlewares/auth');
const { handler } = require('../lib/http');
const { ROLES } = require('../config/catalogos');

// Módulo de administración: solo ADMINISTRADOR.
const router = express.Router();
router.use(requireSession, requireRole(ROLES.ADMINISTRADOR));

router.get('/resumen', handler('No fue posible consultar el resumen.', async (request, response) => {
	response.json(await adminService.overview());
}));

// --- Usuarios ---
router.get('/usuarios/catalogos', handler('No fue posible cargar los catálogos.', async (request, response) => {
	response.json(await adminService.catalogsForUsers());
}));
router.get('/usuarios', handler('No fue posible consultar los usuarios.', async (request, response) => {
	response.json(await adminService.listUsers(request.query));
}));
router.post('/usuarios', handler('No fue posible crear el usuario.', async (request, response) => {
	response.status(201).json(await adminService.createUser(request.user, request.body));
}));
router.put('/usuarios/:userId', handler('No fue posible actualizar el usuario.', async (request, response) => {
	response.json(await adminService.updateUser(request.user, request.params.userId, request.body));
}));
router.patch('/usuarios/:userId/rol', handler('No fue posible cambiar el rol.', async (request, response) => {
	response.json(await adminService.changeRole(request.user, request.params.userId, request.body?.rol));
}));
router.patch('/usuarios/:userId/estado', handler('No fue posible cambiar el estado.', async (request, response) => {
	response.json(await adminService.setUserActive(request.user, request.params.userId, Boolean(request.body?.activo)));
}));
router.post('/usuarios/:userId/acceso', handler('No fue posible enviar el enlace de acceso.', async (request, response) => {
	response.json(await adminService.resendAccess(request.user, request.params.userId));
}));

// --- Instituciones ---
router.get('/instituciones', handler('No fue posible consultar las instituciones.', async (request, response) => {
	response.json(await adminService.listInstitutions());
}));
router.post('/instituciones', handler('No fue posible crear la institución.', async (request, response) => {
	response.status(201).json(await adminService.saveInstitution(request.user, null, request.body));
}));
router.put('/instituciones/:institutionId', handler('No fue posible actualizar la institución.', async (request, response) => {
	response.json(await adminService.saveInstitution(request.user, request.params.institutionId, request.body));
}));
router.patch('/instituciones/:institutionId/estado', handler('No fue posible cambiar el estado.', async (request, response) => {
	response.json(await adminService.setInstitutionActive(request.user, request.params.institutionId, Boolean(request.body?.activo)));
}));

// --- Plantas ---
router.get('/plantas', handler('No fue posible consultar las plantas.', async (request, response) => {
	response.json(await adminService.listPlants());
}));
router.post('/plantas', handler('No fue posible crear la planta.', async (request, response) => {
	response.status(201).json(await adminService.savePlant(request.user, null, request.body));
}));
router.put('/plantas/:plantId', handler('No fue posible actualizar la planta.', async (request, response) => {
	response.json(await adminService.savePlant(request.user, request.params.plantId, request.body));
}));
router.patch('/plantas/:plantId/estado', handler('No fue posible cambiar el estado.', async (request, response) => {
	response.json(await adminService.setPlantActive(request.user, request.params.plantId, Boolean(request.body?.activo)));
}));

// --- Dispositivos ---
router.get('/dispositivos', handler('No fue posible consultar los dispositivos.', async (request, response) => {
	response.json(await adminService.listDevices());
}));
router.post('/dispositivos/:deviceId/desvincular', handler('No fue posible desvincular el dispositivo.', async (request, response) => {
	response.json(await adminService.releaseDevice(request.user, request.params.deviceId));
}));
router.patch('/dispositivos/:deviceId/estado', handler('No fue posible cambiar el estado del dispositivo.', async (request, response) => {
	response.json(await adminService.setDeviceActive(request.user, request.params.deviceId, Boolean(request.body?.activo)));
}));

// --- Auditoría ---
router.get('/auditoria', handler('No fue posible consultar la auditoría.', async (request, response) => {
	response.json(await adminService.listAudit(request.query));
}));

module.exports = router;
