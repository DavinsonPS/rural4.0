const crypto = require('node:crypto');
const repo = require('../repositories/cuestionarios.repo');
const { withTransaction } = require('../repositories/transaccion');
const proyectosService = require('./proyectos.service');
const { audit } = require('./auditoria.service');
const { ROLES } = require('../config/catalogos');
const { ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../lib/errors');
const { positiveInteger, text } = require('../lib/http');
const { toCsv } = require('../lib/csv');

// Reglas de producto:
// - Banco del sistema + preguntas propias del docente; solo preguntas cerradas.
// - Se asigna a todos los estudiantes que tienen al docente en un proyecto activo.
// - Un intento por estudiante. Ve su puntaje al enviar y las respuestas correctas solo
//   cuando el cuestionario cierra.
// - Una vez publicado, las preguntas del cuestionario no cambian (los resultados serían
//   incomparables); solo se editan título, descripción y fecha de cierre.

const QUESTION_TYPES = ['opcion_multiple', 'verdadero_falso'];
const MAX_QUESTIONS = 30;

function isAdmin(actor) {
	return actor?.rol === ROLES.ADMINISTRADOR;
}

function flag(value) {
	return Boolean(Number(value));
}

function percentage(correct, total) {
	return Number(total) ? Math.round((Number(correct) / Number(total)) * 100) : null;
}

// Acepta 'AAAA-MM-DDTHH:MM' (input datetime-local) o 'AAAA-MM-DD HH:MM[:SS]'.
function readDateTime(value, label) {
	const match = text(value).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?$/);
	if (!match) throw new ValidationError(`La fecha de ${label} no es válida.`);
	return `${match[1]} ${match[2]}:00`;
}

function formatQuiz(quiz) {
	return {
		...quiz,
		publicado: flag(quiz.publicado),
		iniciado: flag(quiz.iniciado),
		cerrado: flag(quiz.cerrado),
		total_preguntas: Number(quiz.total_preguntas) || 0,
		...(quiz.cierre_futuro !== undefined ? { cierre_futuro: flag(quiz.cierre_futuro) } : {}),
	};
}

async function withOptions(questions, { includeCorrect }) {
	const options = await repo.listOptions(questions.map((question) => question.id));
	return questions.map((question) => ({
		...question,
		...(question.en_uso !== undefined ? { en_uso: flag(question.en_uso) } : {}),
		...(includeCorrect ? {} : { explicacion: undefined }),
		opciones: options
			.filter((option) => option.id_pregunta === question.id)
			.map(({ id, texto, es_correcta }) => (includeCorrect ? { id, texto, es_correcta: flag(es_correcta) } : { id, texto })),
	}));
}

// Orden de opciones distinto para cada estudiante (en el banco la correcta suele ser la
// primera) pero estable: recargar la página no lo cambia. Verdadero/Falso no se mezcla.
function shuffleOptions(question, seed) {
	if (question.tipo !== 'opcion_multiple') return question;
	const key = (option) => crypto.createHash('sha256').update(`${seed}:${question.id}:${option.id}`).digest('hex');
	return { ...question, opciones: [...question.opciones].sort((first, second) => key(first).localeCompare(key(second))) };
}

// Calificación en el servidor: nunca se confía en lo que diga el navegador sobre aciertos.
// questions: [{ id, opciones: [{ id, es_correcta }] }]; answers: [{ id_pregunta, id_opcion }]
function grade(questions, answers) {
	const chosen = new Map((Array.isArray(answers) ? answers : []).map((answer) => [Number(answer.id_pregunta), Number(answer.id_opcion)]));
	const graded = questions.map((question) => {
		const optionId = chosen.get(Number(question.id));
		const option = question.opciones.find((item) => Number(item.id) === optionId);
		if (!option) throw new ValidationError('Responde todas las preguntas antes de enviar.');
		return { id_pregunta: question.id, id_opcion: option.id, es_correcta: Boolean(option.es_correcta) };
	});
	return { answers: graded, correctas: graded.filter((answer) => answer.es_correcta).length, total: graded.length };
}

// --- Docente: acceso a sus cuestionarios ---

async function loadOwnQuiz(actor, quizIdValue) {
	const quizId = positiveInteger(quizIdValue);
	if (!quizId) throw new ValidationError('Cuestionario inválido.');
	const quiz = await repo.findQuiz(quizId);
	if (!quiz || (!isAdmin(actor) && Number(quiz.id_docente) !== Number(actor.id))) throw new NotFoundError('Cuestionario no encontrado.');
	return formatQuiz(quiz);
}

async function listTopics() {
	return repo.listTopics();
}

async function listBank(actor, topicIdValue) {
	const questions = await repo.listBank(actor.id, positiveInteger(topicIdValue));
	const withAll = await withOptions(questions, { includeCorrect: true });
	return withAll.map((question) => ({ ...question, propia: Number(question.id_docente) === Number(actor.id) }));
}

function readQuestion(body = {}) {
	const tipo = text(body.tipo);
	const enunciado = text(body.enunciado).slice(0, 500);
	const explicacion = text(body.explicacion).slice(0, 500) || null;
	const idTema = positiveInteger(body.id_tema);
	if (!QUESTION_TYPES.includes(tipo) || !enunciado || !idTema) throw new ValidationError('Completa el tema, el tipo y el enunciado de la pregunta.');
	let opciones;
	if (tipo === 'verdadero_falso') {
		const correct = body.respuesta_correcta === true || body.respuesta_correcta === 'verdadero';
		opciones = [{ texto: 'Verdadero', es_correcta: correct }, { texto: 'Falso', es_correcta: !correct }];
	} else {
		opciones = (Array.isArray(body.opciones) ? body.opciones : [])
			.map((option) => ({ texto: text(option?.texto).slice(0, 255), es_correcta: Boolean(option?.es_correcta) }))
			.filter((option) => option.texto);
		if (opciones.length < 2 || opciones.length > 5) throw new ValidationError('Una pregunta de opción múltiple necesita entre 2 y 5 opciones.');
		if (opciones.filter((option) => option.es_correcta).length !== 1) throw new ValidationError('Marca exactamente una opción correcta.');
	}
	return { question: { idTema, tipo, enunciado, explicacion }, opciones };
}

async function createQuestion(actor, body) {
	const { question, opciones } = readQuestion(body);
	if (!await repo.findTopic(question.idTema)) throw new ValidationError('El tema seleccionado no existe.');
	const id = await withTransaction(async (connection) => {
		const questionId = await repo.insertQuestion(connection, { ...question, idDocente: actor.id });
		await repo.replaceOptions(connection, questionId, opciones);
		return questionId;
	});
	return { id };
}

async function loadOwnQuestion(actor, questionIdValue) {
	const questionId = positiveInteger(questionIdValue);
	const question = questionId ? await repo.findQuestion(questionId) : null;
	if (!question || !Number(question.estado)) throw new NotFoundError('Pregunta no encontrada.');
	if (question.id_docente === null) throw new ForbiddenError('Las preguntas del banco del sistema no se pueden modificar.');
	if (Number(question.id_docente) !== Number(actor.id)) throw new NotFoundError('Pregunta no encontrada.');
	return question;
}

async function updateQuestion(actor, questionId, body) {
	const existing = await loadOwnQuestion(actor, questionId);
	if (flag(existing.en_uso)) throw new ConflictError('La pregunta ya está en un cuestionario publicado; crea una nueva en lugar de modificarla.');
	const { question, opciones } = readQuestion(body);
	if (!await repo.findTopic(question.idTema)) throw new ValidationError('El tema seleccionado no existe.');
	await withTransaction(async (connection) => {
		await repo.updateQuestion(connection, existing.id, question);
		await repo.replaceOptions(connection, existing.id, opciones);
	});
	return { id: existing.id };
}

async function deleteQuestion(actor, questionId) {
	const existing = await loadOwnQuestion(actor, questionId);
	await repo.softDeleteQuestion(existing.id);
	return { id: existing.id };
}

async function readQuizBody(actor, body = {}) {
	const titulo = text(body.titulo).slice(0, 150);
	const descripcion = text(body.descripcion).slice(0, 500) || null;
	const idTema = positiveInteger(body.id_tema);
	if (!titulo || !idTema) throw new ValidationError('El cuestionario necesita título y tema.');
	if (!await repo.findTopic(idTema)) throw new ValidationError('El tema seleccionado no existe.');
	const fechaApertura = readDateTime(body.fecha_apertura, 'apertura');
	const fechaCierre = readDateTime(body.fecha_cierre, 'cierre');
	if (fechaCierre <= fechaApertura) throw new ValidationError('La fecha de cierre debe ser posterior a la de apertura.');
	const requested = [...new Set((Array.isArray(body.preguntas) ? body.preguntas : []).map(positiveInteger).filter(Boolean))];
	if (requested.length > MAX_QUESTIONS) throw new ValidationError(`Un cuestionario puede tener hasta ${MAX_QUESTIONS} preguntas.`);
	const usable = new Set(await repo.findUsableQuestionIds(requested, actor.id));
	if (requested.some((questionId) => !usable.has(questionId))) throw new ValidationError('Alguna pregunta seleccionada no está disponible.');
	return { quiz: { titulo, descripcion, idTema, fechaApertura, fechaCierre }, questionIds: requested };
}

async function createQuiz(actor, body) {
	const { quiz, questionIds } = await readQuizBody(actor, body);
	const id = await withTransaction(async (connection) => {
		const quizId = await repo.insertQuiz(connection, { ...quiz, idDocente: actor.id });
		await repo.replaceQuizQuestions(connection, quizId, questionIds);
		return quizId;
	});
	return { id };
}

async function updateQuiz(actor, quizId, body = {}) {
	const quiz = await loadOwnQuiz(actor, quizId);
	if (quiz.publicado) {
		const titulo = text(body.titulo).slice(0, 150) || quiz.titulo;
		const descripcion = body.descripcion === undefined ? quiz.descripcion : text(body.descripcion).slice(0, 500) || null;
		const fechaCierre = body.fecha_cierre ? readDateTime(body.fecha_cierre, 'cierre') : `${quiz.fecha_cierre}:00`;
		if (fechaCierre <= `${quiz.fecha_apertura}:00`) throw new ValidationError('La fecha de cierre debe ser posterior a la de apertura.');
		await repo.updatePublishedQuiz(quiz.id, { titulo, descripcion, fechaCierre });
		await audit(actor, 'cuestionario.editar', 'cuestionario', quiz.id, { fecha_cierre: fechaCierre });
		return { id: quiz.id };
	}
	const { quiz: fields, questionIds } = await readQuizBody(actor, body);
	await withTransaction(async (connection) => {
		await repo.updateQuiz(connection, quiz.id, fields);
		await repo.replaceQuizQuestions(connection, quiz.id, questionIds);
	});
	return { id: quiz.id };
}

async function publishQuiz(actor, quizId) {
	const quiz = await loadOwnQuiz(actor, quizId);
	if (quiz.publicado) throw new ConflictError('El cuestionario ya está publicado.');
	if (!quiz.total_preguntas) throw new ValidationError('Agrega al menos una pregunta antes de publicar.');
	if (!quiz.cierre_futuro) throw new ValidationError('La fecha de cierre ya pasó. Cámbiala antes de publicar.');
	await repo.publish(quiz.id);
	await audit(actor, 'cuestionario.publicar', 'cuestionario', quiz.id);
	return { id: quiz.id, publicado: true };
}

async function archiveQuiz(actor, quizId) {
	const quiz = await loadOwnQuiz(actor, quizId);
	await repo.archive(quiz.id);
	await audit(actor, 'cuestionario.archivar', 'cuestionario', quiz.id);
	return { id: quiz.id };
}

async function listForTeacher(actor) {
	const quizzes = await repo.listForTeacher(isAdmin(actor) ? null : actor.id);
	return quizzes.map((quiz) => ({
		...formatQuiz(quiz),
		respondieron: Number(quiz.respondieron) || 0,
		asignados: Number(quiz.asignados) || 0,
		promedio_pct: quiz.promedio_pct === null ? null : Number(quiz.promedio_pct),
	}));
}

async function getForTeacher(actor, quizId) {
	const quiz = await loadOwnQuiz(actor, quizId);
	const questions = await withOptions(await repo.listQuizQuestions(quiz.id), { includeCorrect: true });
	return { ...quiz, preguntas: questions };
}

async function results(actor, quizId) {
	const quiz = await loadOwnQuiz(actor, quizId);
	const [questions, counts, students] = await Promise.all([
		repo.listQuizQuestions(quiz.id).then((rows) => withOptions(rows, { includeCorrect: true })),
		repo.optionCounts(quiz.id),
		repo.listAssignedStudents(quiz.id, quiz.id_docente),
	]);
	const countFor = (questionId, optionId) => Number(counts.find((row) => row.id_pregunta === questionId && row.id_opcion === optionId)?.conteo) || 0;
	const answered = students.filter((student) => student.id_intento);
	const questionStats = questions.map((question) => {
		const opciones = question.opciones.map((option) => ({ ...option, conteo: countFor(question.id, option.id) }));
		const respuestas = opciones.reduce((sum, option) => sum + option.conteo, 0);
		const correctas = opciones.filter((option) => option.es_correcta).reduce((sum, option) => sum + option.conteo, 0);
		return { ...question, opciones, respuestas, pct_acierto: percentage(correctas, respuestas) };
	});
	const average = answered.length ? Math.round(answered.reduce((sum, student) => sum + percentage(student.correctas, student.total), 0) / answered.length) : null;
	return {
		cuestionario: quiz,
		resumen: { asignados: students.length, respondieron: answered.length, pendientes: students.length - answered.length, promedio_pct: average },
		preguntas: questionStats,
		estudiantes: students.map((student) => ({
			id: student.id,
			nombres: student.nombres,
			apellidos: student.apellidos,
			usuario: student.usuario,
			respondido: Boolean(student.id_intento),
			correctas: student.id_intento ? student.correctas : null,
			total: student.id_intento ? student.total : null,
			pct: student.id_intento ? percentage(student.correctas, student.total) : null,
			fecha_envio: student.fecha_envio,
		})),
	};
}

async function resultsCsv(actor, quizId) {
	const data = await results(actor, quizId);
	const answers = await repo.answersByQuiz(data.cuestionario.id);
	const headers = ['Estudiante', 'Usuario', 'Estado', 'Correctas', 'Total', 'Porcentaje', 'Fecha de envío',
		...data.preguntas.map((question, index) => `P${index + 1}: ${question.enunciado}`)];
	const rows = data.estudiantes.map((student) => [
		`${student.apellidos} ${student.nombres}`.trim(),
		student.usuario,
		student.respondido ? 'Respondido' : 'Pendiente',
		student.correctas ?? '',
		student.total ?? '',
		student.pct === null ? '' : `${student.pct}%`,
		student.fecha_envio || '',
		...data.preguntas.map((question) => {
			const answer = answers.find((item) => item.id_estudiante === student.id && item.id_pregunta === question.id);
			return answer ? (flag(answer.es_correcta) ? 'Correcta' : 'Incorrecta') : '';
		}),
	]);
	return { csv: toCsv(headers, rows), titulo: data.cuestionario.titulo };
}

// Resultados de cuestionarios del estudiante de un proyecto (para la ficha docente).
async function studentSummaryForProject(actor, projectId) {
	const project = await proyectosService.loadFor(actor, projectId, 'supervise');
	const teacherId = isAdmin(actor) ? null : actor.id;
	const [temas, intentos, pendientes] = await Promise.all([
		repo.topicMastery(project.id_usuario, teacherId),
		repo.attemptsByStudent(project.id_usuario, teacherId),
		repo.countPendingForStudent(project.id_usuario, project.id_docente),
	]);
	return {
		temas: temas.map((topic) => ({ tema: topic.tema, respuestas: Number(topic.respuestas), correctas: Number(topic.correctas), pct: percentage(topic.correctas, topic.respuestas) })),
		intentos: intentos.map((attempt) => ({ ...attempt, pct: percentage(attempt.correctas, attempt.total) })),
		pendientes,
	};
}

// --- Estudiante ---

async function listForStudent(user) {
	const quizzes = await repo.listForStudent(user.id);
	return quizzes.map((quiz) => {
		const formatted = formatQuiz(quiz);
		return {
			id: formatted.id,
			titulo: formatted.titulo,
			descripcion: formatted.descripcion,
			tema: formatted.tema,
			docente: `${quiz.docente_nombres} ${quiz.docente_apellidos}`.trim(),
			fecha_cierre: formatted.fecha_cierre,
			cerrado: formatted.cerrado,
			total_preguntas: formatted.total_preguntas,
			respondido: Boolean(quiz.id_intento),
			correctas: quiz.id_intento ? quiz.correctas : null,
			total: quiz.id_intento ? quiz.total : null,
			pct: quiz.id_intento ? percentage(quiz.correctas, quiz.total) : null,
			fecha_envio: quiz.fecha_envio,
		};
	});
}

async function loadStudentQuiz(user, quizIdValue) {
	const quizId = positiveInteger(quizIdValue);
	const quiz = quizId ? await repo.findQuiz(quizId) : null;
	if (!quiz || !flag(quiz.publicado) || !flag(quiz.iniciado) || !await repo.isEligible(user.id, quiz.id_docente)) {
		throw new NotFoundError('Cuestionario no encontrado.');
	}
	return formatQuiz(quiz);
}

async function getForStudent(user, quizId) {
	const quiz = await loadStudentQuiz(user, quizId);
	const attempt = await repo.findAttempt(quiz.id, user.id);
	const reveal = quiz.cerrado;
	const questions = await withOptions(await repo.listQuizQuestions(quiz.id), { includeCorrect: reveal });
	const chosen = attempt ? await repo.listAttemptAnswers(attempt.id) : [];
	return {
		id: quiz.id,
		titulo: quiz.titulo,
		descripcion: quiz.descripcion,
		tema: quiz.tema,
		fecha_cierre: quiz.fecha_cierre,
		cerrado: quiz.cerrado,
		respondido: Boolean(attempt),
		puede_responder: !attempt && !quiz.cerrado,
		resultado: attempt ? { correctas: attempt.correctas, total: attempt.total, pct: percentage(attempt.correctas, attempt.total), fecha_envio: attempt.fecha_envio } : null,
		respuestas_visibles: reveal,
		preguntas: questions.map((question) => shuffleOptions(question, `${user.id}:${quiz.id}`)).map((question) => ({
			...question,
			id_opcion_elegida: chosen.find((answer) => answer.id_pregunta === question.id)?.id_opcion ?? null,
		})),
	};
}

async function submit(user, quizId, body = {}) {
	const quiz = await loadStudentQuiz(user, quizId);
	if (quiz.cerrado) throw new ConflictError('El cuestionario ya cerró.');
	if (await repo.findAttempt(quiz.id, user.id)) throw new ConflictError('Ya respondiste este cuestionario.');
	const questions = await withOptions(await repo.listQuizQuestions(quiz.id), { includeCorrect: true });
	if (!questions.length) throw new ConflictError('El cuestionario no tiene preguntas.');
	const graded = grade(questions, body.respuestas);
	try {
		await withTransaction((connection) => repo.insertAttempt(connection, { quizId: quiz.id, studentId: user.id, ...graded }));
	} catch (error) {
		if (error.code === 'ER_DUP_ENTRY') throw new ConflictError('Ya respondiste este cuestionario.');
		throw error;
	}
	return { correctas: graded.correctas, total: graded.total, pct: percentage(graded.correctas, graded.total), respuestas_visibles_desde: quiz.fecha_cierre };
}

module.exports = {
	grade,
	listTopics,
	listBank,
	createQuestion,
	updateQuestion,
	deleteQuestion,
	createQuiz,
	updateQuiz,
	publishQuiz,
	archiveQuiz,
	listForTeacher,
	getForTeacher,
	results,
	resultsCsv,
	studentSummaryForProject,
	listForStudent,
	getForStudent,
	submit,
};
