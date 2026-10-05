const express = require('express');
const catalogosRepo = require('../repositories/catalogos.repo');
const proyectosService = require('../services/proyectos.service');
const { requireSession, requireRole } = require('../middlewares/auth');
const { handler } = require('../lib/http');
const { ROLES } = require('../config/catalogos');

const router = express.Router();

router.get('/plantas', handler('No fue posible consultar las plantas.', async (request, response) => {
	response.json(await catalogosRepo.listPlants());
}));

router.use(requireSession);

// Docentes que el estudiante puede elegir: solo los de su institución.
router.get('/docentes', handler('No fue posible consultar los docentes.', async (request, response) => {
	response.json(await proyectosService.listTeachersForUser(request.user));
}));

router.get('/', requireRole(ROLES.ESTUDIANTE), handler('No fue posible consultar los proyectos.', async (request, response) => {
	response.json(await proyectosService.listForStudent(request.user));
}));

router.post('/', requireRole(ROLES.ESTUDIANTE), handler('No fue posible crear el proyecto.', async (request, response) => {
	response.status(201).json(await proyectosService.create(request.user, request.body));
}));

router.put('/:projectId', handler('No fue posible actualizar el proyecto.', async (request, response) => {
	response.json(await proyectosService.update(request.user, request.params.projectId, request.body));
}));

router.delete('/:projectId', handler('No fue posible eliminar el proyecto.', async (request, response) => {
	response.json(await proyectosService.archive(request.user, request.params.projectId));
}));

router.get('/resumen/:projectId', handler('No fue posible consultar el resumen del proyecto.', async (request, response) => {
	response.json(await proyectosService.summary(request.user, request.params.projectId));
}));

router.get('/resumen/:projectId/lecturas', handler('No fue posible consultar el historial de monitoreo.', async (request, response) => {
	response.json(await proyectosService.readingsHistory(request.user, request.params.projectId));
}));

module.exports = router;
