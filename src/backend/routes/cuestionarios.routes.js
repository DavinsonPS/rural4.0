const express = require('express');
const cuestionariosService = require('../services/cuestionarios.service');
const { requireSession, requireRole } = require('../middlewares/auth');
const { handler } = require('../lib/http');
const { ROLES } = require('../config/catalogos');

// Cuestionarios desde el lado del estudiante. La gestión y los resultados están en /api/docente.
const router = express.Router();
router.use(requireSession, requireRole(ROLES.ESTUDIANTE));

router.get('/', handler('No fue posible consultar los cuestionarios.', async (request, response) => {
	response.json(await cuestionariosService.listForStudent(request.user));
}));

router.get('/:quizId', handler('No fue posible abrir el cuestionario.', async (request, response) => {
	response.setHeader('Cache-Control', 'no-store');
	response.json(await cuestionariosService.getForStudent(request.user, request.params.quizId));
}));

router.post('/:quizId/respuestas', handler('No fue posible enviar tus respuestas.', async (request, response) => {
	response.status(201).json(await cuestionariosService.submit(request.user, request.params.quizId, request.body));
}));

module.exports = router;
