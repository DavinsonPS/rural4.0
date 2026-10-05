const assert = require('node:assert/strict');
const test = require('node:test');
const { users, stubSessionUsers, startApp } = require('./helpers');
const repo = require('../repositories/cuestionarios.repo');
const { grade } = require('../services/cuestionarios.service');

const questions = [
	{ id: 1, tipo: 'opcion_multiple', opciones: [{ id: 10, es_correcta: true }, { id: 11, es_correcta: false }, { id: 12, es_correcta: false }] },
	{ id: 2, tipo: 'verdadero_falso', opciones: [{ id: 20, es_correcta: false }, { id: 21, es_correcta: true }] },
];

test('la calificación cuenta aciertos en el servidor', () => {
	const result = grade(questions, [{ id_pregunta: 1, id_opcion: 10 }, { id_pregunta: 2, id_opcion: 20 }]);
	assert.equal(result.correctas, 1);
	assert.equal(result.total, 2);
});

test('rechaza respuestas incompletas o con opciones de otra pregunta', () => {
	assert.throws(() => grade(questions, [{ id_pregunta: 1, id_opcion: 10 }]), { status: 400 });
	assert.throws(() => grade(questions, [{ id_pregunta: 1, id_opcion: 20 }, { id_pregunta: 2, id_opcion: 21 }]), { status: 400 });
});

test('el estudiante no recibe respuestas correctas antes del cierre, y sí después', async () => {
	stubSessionUsers();
	const quiz = { id: 5, id_docente: users.docente.id, titulo: 'Riego', tema: 'Riego', publicado: 1, iniciado: 1, cerrado: 0, total_preguntas: 1, fecha_cierre: '2026-10-01 12:00' };
	repo.findQuiz = async () => ({ ...quiz });
	repo.isEligible = async (studentId) => studentId === users.estudiante.id;
	repo.findAttempt = async () => null;
	repo.listQuizQuestions = async () => [{ id: 1, tipo: 'opcion_multiple', enunciado: '¿?', explicacion: 'Porque sí' }];
	repo.listOptions = async () => [{ id: 10, id_pregunta: 1, texto: 'A', es_correcta: 1 }, { id: 11, id_pregunta: 1, texto: 'B', es_correcta: 0 }];
	const app = await startApp([['/api/cuestionarios', require('../routes/cuestionarios.routes')]]);
	try {
		const open = await (await app.request('/api/cuestionarios/5', { user: users.estudiante })).text();
		assert.ok(!open.includes('es_correcta') && !open.includes('Porque sí'));
		assert.equal((await app.request('/api/cuestionarios/5', { user: users.otroEstudiante })).status, 404);
		quiz.cerrado = 1;
		const closed = await (await app.request('/api/cuestionarios/5', { user: users.estudiante })).json();
		assert.equal(closed.respuestas_visibles, true);
		assert.ok(closed.preguntas[0].opciones.some((option) => option.es_correcta));
	} finally {
		await app.close();
	}
});
