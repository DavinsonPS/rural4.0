const express = require('express');
const docenteService = require('../services/docente.service');
const proyectosService = require('../services/proyectos.service');
const fotografiasService = require('../services/fotografias.service');
const cuestionariosService = require('../services/cuestionarios.service');
const { requireSession, requireRole } = require('../middlewares/auth');
const { handler } = require('../lib/http');
const { ROLES } = require('../config/catalogos');

// Funciones propias del acompañamiento docente. Los recursos de cada proyecto (resumen,
// lecturas, bitácoras, fotos, LED, dispositivos) se consultan con las rutas generales:
// la política de acceso ya deja entrar al docente asignado.
const router = express.Router();
router.use(requireSession, requireRole(ROLES.DOCENTE, ROLES.ADMINISTRADOR));

router.get('/resumen', handler('No fue posible consultar el resumen docente.', async (request, response) => {
	response.json(await docenteService.panelSummary(request.user));
}));

router.get('/proyectos', handler('No fue posible consultar los proyectos.', async (request, response) => {
	const estado = String(request.query.estado || 'activos');
	const projects = await docenteService.listProjects(request.user);
	const filtered = estado === 'todos' ? projects : projects.filter((project) => project.finalizado === (estado === 'finalizados'));
	response.json(filtered);
}));

router.get('/proyectos/:projectId/docentes', handler('No fue posible consultar los docentes.', async (request, response) => {
	response.json(await proyectosService.listTeachersForProject(request.user, request.params.projectId));
}));

router.post('/proyectos/:projectId/finalizar', handler('No fue posible finalizar el proyecto.', async (request, response) => {
	response.json(await proyectosService.setFinalized(request.user, request.params.projectId, true));
}));

router.post('/proyectos/:projectId/reabrir', handler('No fue posible reabrir el proyecto.', async (request, response) => {
	response.json(await proyectosService.setFinalized(request.user, request.params.projectId, false));
}));

router.put('/proyectos/:projectId/docente', handler('No fue posible reasignar el proyecto.', async (request, response) => {
	response.json(await proyectosService.reassignTeacher(request.user, request.params.projectId, request.body?.id_docente));
}));

router.patch('/fotografias/:photoId', handler('No fue posible actualizar la fotografía.', async (request, response) => {
	response.json(await fotografiasService.setHidden(request.user, request.params.photoId, Boolean(request.body?.oculta)));
}));

router.get('/exportar.csv', handler('No fue posible generar la exportación.', async (request, response) => {
	const csv = await docenteService.exportCsv(request.user);
	const date = new Date().toISOString().slice(0, 10);
	response.setHeader('Content-Type', 'text/csv; charset=utf-8');
	response.setHeader('Content-Disposition', `attachment; filename="rural40-seguimiento-${date}.csv"`);
	response.setHeader('Cache-Control', 'no-store');
	response.send(csv);
}));

// --- Cuestionarios ---

router.get('/temas', handler('No fue posible consultar los temas.', async (request, response) => {
	response.json(await cuestionariosService.listTopics());
}));

router.get('/banco', handler('No fue posible consultar el banco de preguntas.', async (request, response) => {
	response.json(await cuestionariosService.listBank(request.user, request.query.id_tema));
}));

router.post('/banco', handler('No fue posible crear la pregunta.', async (request, response) => {
	response.status(201).json(await cuestionariosService.createQuestion(request.user, request.body));
}));

router.put('/banco/:questionId', handler('No fue posible actualizar la pregunta.', async (request, response) => {
	response.json(await cuestionariosService.updateQuestion(request.user, request.params.questionId, request.body));
}));

router.delete('/banco/:questionId', handler('No fue posible eliminar la pregunta.', async (request, response) => {
	response.json(await cuestionariosService.deleteQuestion(request.user, request.params.questionId));
}));

router.get('/cuestionarios', handler('No fue posible consultar los cuestionarios.', async (request, response) => {
	response.json(await cuestionariosService.listForTeacher(request.user));
}));

router.post('/cuestionarios', handler('No fue posible crear el cuestionario.', async (request, response) => {
	response.status(201).json(await cuestionariosService.createQuiz(request.user, request.body));
}));

router.get('/cuestionarios/:quizId', handler('No fue posible abrir el cuestionario.', async (request, response) => {
	response.json(await cuestionariosService.getForTeacher(request.user, request.params.quizId));
}));

router.put('/cuestionarios/:quizId', handler('No fue posible guardar el cuestionario.', async (request, response) => {
	response.json(await cuestionariosService.updateQuiz(request.user, request.params.quizId, request.body));
}));

router.post('/cuestionarios/:quizId/publicar', handler('No fue posible publicar el cuestionario.', async (request, response) => {
	response.json(await cuestionariosService.publishQuiz(request.user, request.params.quizId));
}));

router.delete('/cuestionarios/:quizId', handler('No fue posible archivar el cuestionario.', async (request, response) => {
	response.json(await cuestionariosService.archiveQuiz(request.user, request.params.quizId));
}));

router.get('/cuestionarios/:quizId/resultados', handler('No fue posible consultar los resultados.', async (request, response) => {
	response.json(await cuestionariosService.results(request.user, request.params.quizId));
}));

router.get('/cuestionarios/:quizId/resultados.csv', handler('No fue posible exportar los resultados.', async (request, response) => {
	const { csv } = await cuestionariosService.resultsCsv(request.user, request.params.quizId);
	response.setHeader('Content-Type', 'text/csv; charset=utf-8');
	response.setHeader('Content-Disposition', `attachment; filename="rural40-cuestionario-${Number(request.params.quizId)}.csv"`);
	response.setHeader('Cache-Control', 'no-store');
	response.send(csv);
}));

router.get('/proyectos/:projectId/cuestionarios', handler('No fue posible consultar los cuestionarios del estudiante.', async (request, response) => {
	response.json(await cuestionariosService.studentSummaryForProject(request.user, request.params.projectId));
}));

module.exports = router;
