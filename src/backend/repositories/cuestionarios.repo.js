const { pool } = require('../db');

// Las fechas se devuelven como texto 'AAAA-MM-DD HH:MM' (hora de Colombia, la de la BD)
// y los estados abierto/cerrado se calculan con NOW() de la BD, para no depender de la
// zona horaria del proceso Node.
const QUIZ_COLUMNS = `c.id, c.id_docente, c.id_tema, t.codigo AS tema_codigo, t.nombre AS tema, c.titulo, c.descripcion,
	DATE_FORMAT(c.fecha_apertura, '%Y-%m-%d %H:%i') AS fecha_apertura,
	DATE_FORMAT(c.fecha_cierre, '%Y-%m-%d %H:%i') AS fecha_cierre,
	c.publicado, c.estado,
	(NOW() >= c.fecha_apertura) AS iniciado,
	(NOW() >= c.fecha_cierre) AS cerrado,
	(SELECT COUNT(*) FROM tblh_cuestionario_preguntas cp WHERE cp.id_cuestionario = c.id) AS total_preguntas`;

async function listTopics() {
	const [rows] = await pool.query('SELECT id, codigo, nombre, descripcion FROM tbld_temas WHERE estado = 1 ORDER BY orden, nombre');
	return rows;
}

async function findTopic(topicId) {
	const [rows] = await pool.query('SELECT id, codigo, nombre FROM tbld_temas WHERE id = ? AND estado = 1 LIMIT 1', [topicId]);
	return rows[0] || null;
}

// --- Banco de preguntas ---

async function listOptions(questionIds, connection = pool) {
	if (!questionIds.length) return [];
	const [rows] = await connection.query(
		'SELECT id, id_pregunta, orden, texto, es_correcta FROM tblh_opciones_pregunta WHERE id_pregunta IN (?) ORDER BY id_pregunta, orden',
		[questionIds],
	);
	return rows;
}

// Preguntas del sistema más las propias del docente (activas).
async function listBank(teacherId, topicId = null) {
	const [rows] = await pool.query(
		`SELECT p.id, p.id_tema, t.nombre AS tema, p.id_docente, p.tipo, p.enunciado, p.explicacion,
				EXISTS (SELECT 1 FROM tblh_cuestionario_preguntas cp JOIN tblh_cuestionarios c ON c.id = cp.id_cuestionario
					WHERE cp.id_pregunta = p.id AND c.publicado = 1) AS en_uso
		 FROM tblh_preguntas p
		 JOIN tbld_temas t ON t.id = p.id_tema
		 WHERE p.estado = 1 AND (p.id_docente IS NULL OR p.id_docente = ?) AND (? IS NULL OR p.id_tema = ?)
		 ORDER BY t.orden, p.id_docente IS NULL DESC, p.id`,
		[teacherId, topicId, topicId],
	);
	return rows;
}

async function findQuestion(questionId) {
	const [rows] = await pool.query(
		`SELECT p.id, p.id_tema, p.id_docente, p.tipo, p.enunciado, p.explicacion, p.estado,
				EXISTS (SELECT 1 FROM tblh_cuestionario_preguntas cp JOIN tblh_cuestionarios c ON c.id = cp.id_cuestionario
					WHERE cp.id_pregunta = p.id AND c.publicado = 1) AS en_uso
		 FROM tblh_preguntas p WHERE p.id = ? LIMIT 1`,
		[questionId],
	);
	return rows[0] || null;
}

// Preguntas que el docente puede usar en un cuestionario (sistema o propias, activas).
async function findUsableQuestionIds(questionIds, teacherId) {
	if (!questionIds.length) return [];
	const [rows] = await pool.query(
		'SELECT id FROM tblh_preguntas WHERE id IN (?) AND estado = 1 AND (id_docente IS NULL OR id_docente = ?)',
		[questionIds, teacherId],
	);
	return rows.map((row) => row.id);
}

async function insertQuestion(connection, question) {
	const [result] = await connection.query(
		'INSERT INTO tblh_preguntas (id_tema, id_docente, tipo, enunciado, explicacion) VALUES (?, ?, ?, ?, ?)',
		[question.idTema, question.idDocente, question.tipo, question.enunciado, question.explicacion],
	);
	return result.insertId;
}

async function updateQuestion(connection, questionId, question) {
	await connection.query(
		'UPDATE tblh_preguntas SET id_tema = ?, tipo = ?, enunciado = ?, explicacion = ? WHERE id = ?',
		[question.idTema, question.tipo, question.enunciado, question.explicacion, questionId],
	);
}

// Las opciones de una pregunta no usada en cuestionarios publicados se reemplazan completas.
async function replaceOptions(connection, questionId, options) {
	await connection.query('DELETE FROM tblh_opciones_pregunta WHERE id_pregunta = ?', [questionId]);
	await connection.query(
		'INSERT INTO tblh_opciones_pregunta (id_pregunta, orden, texto, es_correcta) VALUES ?',
		[options.map((option, index) => [questionId, index + 1, option.texto, option.es_correcta ? 1 : 0])],
	);
}

async function softDeleteQuestion(questionId) {
	await pool.query('UPDATE tblh_preguntas SET estado = 0 WHERE id = ?', [questionId]);
}

// --- Cuestionarios ---

async function listForTeacher(teacherId = null) {
	const [rows] = await pool.query(
		`SELECT ${QUIZ_COLUMNS},
				(SELECT COUNT(*) FROM tblh_intentos i WHERE i.id_cuestionario = c.id) AS respondieron,
				(SELECT ROUND(AVG(i.correctas / i.total) * 100) FROM tblh_intentos i WHERE i.id_cuestionario = c.id AND i.total > 0) AS promedio_pct,
				(SELECT COUNT(DISTINCT p.id_usuario) FROM tblh_proyectos p WHERE p.estado = 1 AND p.id_docente = c.id_docente) AS asignados
		 FROM tblh_cuestionarios c
		 JOIN tbld_temas t ON t.id = c.id_tema
		 WHERE c.estado = 1 AND (? IS NULL OR c.id_docente = ?)
		 ORDER BY c.publicado ASC, c.fecha_cierre DESC`,
		[teacherId, teacherId],
	);
	return rows;
}

async function findQuiz(quizId) {
	const [rows] = await pool.query(
		`SELECT ${QUIZ_COLUMNS}, (NOW() < c.fecha_cierre) AS cierre_futuro
		 FROM tblh_cuestionarios c JOIN tbld_temas t ON t.id = c.id_tema
		 WHERE c.id = ? AND c.estado = 1 LIMIT 1`,
		[quizId],
	);
	return rows[0] || null;
}

async function listQuizQuestions(quizId, connection = pool) {
	const [rows] = await connection.query(
		`SELECT p.id, p.id_tema, t.nombre AS tema, p.tipo, p.enunciado, p.explicacion, cp.orden
		 FROM tblh_cuestionario_preguntas cp
		 JOIN tblh_preguntas p ON p.id = cp.id_pregunta
		 JOIN tbld_temas t ON t.id = p.id_tema
		 WHERE cp.id_cuestionario = ?
		 ORDER BY cp.orden`,
		[quizId],
	);
	return rows;
}

async function insertQuiz(connection, quiz) {
	const [result] = await connection.query(
		`INSERT INTO tblh_cuestionarios (id_docente, id_tema, titulo, descripcion, fecha_apertura, fecha_cierre)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		[quiz.idDocente, quiz.idTema, quiz.titulo, quiz.descripcion, quiz.fechaApertura, quiz.fechaCierre],
	);
	return result.insertId;
}

async function updateQuiz(connection, quizId, quiz) {
	await connection.query(
		'UPDATE tblh_cuestionarios SET id_tema = ?, titulo = ?, descripcion = ?, fecha_apertura = ?, fecha_cierre = ? WHERE id = ?',
		[quiz.idTema, quiz.titulo, quiz.descripcion, quiz.fechaApertura, quiz.fechaCierre, quizId],
	);
}

async function updatePublishedQuiz(quizId, { titulo, descripcion, fechaCierre }) {
	await pool.query('UPDATE tblh_cuestionarios SET titulo = ?, descripcion = ?, fecha_cierre = ? WHERE id = ?', [titulo, descripcion, fechaCierre, quizId]);
}

async function replaceQuizQuestions(connection, quizId, questionIds) {
	await connection.query('DELETE FROM tblh_cuestionario_preguntas WHERE id_cuestionario = ?', [quizId]);
	if (!questionIds.length) return;
	await connection.query(
		'INSERT INTO tblh_cuestionario_preguntas (id_cuestionario, id_pregunta, orden) VALUES ?',
		[questionIds.map((questionId, index) => [quizId, questionId, index + 1])],
	);
}

async function publish(quizId) {
	await pool.query('UPDATE tblh_cuestionarios SET publicado = 1 WHERE id = ? AND estado = 1', [quizId]);
}

async function archive(quizId) {
	await pool.query('UPDATE tblh_cuestionarios SET estado = 0 WHERE id = ?', [quizId]);
}

// --- Estudiante ---

// Un estudiante recibe los cuestionarios de todo docente que tenga en un proyecto activo.
const ELIGIBLE = 'EXISTS (SELECT 1 FROM tblh_proyectos pr WHERE pr.id_usuario = ? AND pr.id_docente = c.id_docente AND pr.estado = 1)';

async function listForStudent(studentId) {
	const [rows] = await pool.query(
		`SELECT ${QUIZ_COLUMNS}, d.nombres AS docente_nombres, d.apellidos AS docente_apellidos,
				i.id AS id_intento, i.correctas, i.total,
				DATE_FORMAT(i.fecha_envio, '%Y-%m-%d %H:%i') AS fecha_envio
		 FROM tblh_cuestionarios c
		 JOIN tbld_temas t ON t.id = c.id_tema
		 JOIN tblh_usuarios d ON d.id = c.id_docente
		 LEFT JOIN tblh_intentos i ON i.id_cuestionario = c.id AND i.id_estudiante = ?
		 WHERE c.estado = 1 AND c.publicado = 1 AND c.fecha_apertura <= NOW() AND ${ELIGIBLE}
		 ORDER BY (NOW() >= c.fecha_cierre) ASC, c.fecha_cierre ASC`,
		[studentId, studentId],
	);
	return rows;
}

async function isEligible(studentId, teacherId) {
	const [rows] = await pool.query(
		'SELECT 1 FROM tblh_proyectos WHERE id_usuario = ? AND id_docente = ? AND estado = 1 LIMIT 1',
		[studentId, teacherId],
	);
	return rows.length > 0;
}

async function findAttempt(quizId, studentId) {
	const [rows] = await pool.query(
		`SELECT id, correctas, total, DATE_FORMAT(fecha_envio, '%Y-%m-%d %H:%i') AS fecha_envio
		 FROM tblh_intentos WHERE id_cuestionario = ? AND id_estudiante = ? LIMIT 1`,
		[quizId, studentId],
	);
	return rows[0] || null;
}

async function listAttemptAnswers(attemptId) {
	const [rows] = await pool.query('SELECT id_pregunta, id_opcion, es_correcta FROM tblh_respuestas WHERE id_intento = ?', [attemptId]);
	return rows;
}

async function insertAttempt(connection, { quizId, studentId, correctas, total, answers }) {
	const [result] = await connection.query(
		'INSERT INTO tblh_intentos (id_cuestionario, id_estudiante, correctas, total) VALUES (?, ?, ?, ?)',
		[quizId, studentId, correctas, total],
	);
	await connection.query(
		'INSERT INTO tblh_respuestas (id_intento, id_pregunta, id_opcion, es_correcta) VALUES ?',
		[answers.map((answer) => [result.insertId, answer.id_pregunta, answer.id_opcion, answer.es_correcta ? 1 : 0])],
	);
	return result.insertId;
}

// --- Resultados para el docente ---

async function optionCounts(quizId) {
	const [rows] = await pool.query(
		`SELECT r.id_pregunta, r.id_opcion, COUNT(*) AS conteo
		 FROM tblh_respuestas r JOIN tblh_intentos i ON i.id = r.id_intento
		 WHERE i.id_cuestionario = ?
		 GROUP BY r.id_pregunta, r.id_opcion`,
		[quizId],
	);
	return rows;
}

// Estudiantes asignados (tienen al docente en un proyecto activo) con su intento, si lo hay.
async function listAssignedStudents(quizId, teacherId) {
	const [rows] = await pool.query(
		`SELECT u.id, u.nombres, u.apellidos, u.usuario, i.id AS id_intento, i.correctas, i.total,
				DATE_FORMAT(i.fecha_envio, '%Y-%m-%d %H:%i') AS fecha_envio
		 FROM tblh_usuarios u
		 LEFT JOIN tblh_intentos i ON i.id_estudiante = u.id AND i.id_cuestionario = ?
		 WHERE u.id IN (SELECT p.id_usuario FROM tblh_proyectos p WHERE p.estado = 1 AND p.id_docente = ?)
			OR i.id IS NOT NULL
		 ORDER BY u.apellidos, u.nombres`,
		[quizId, teacherId],
	);
	return rows;
}

async function answersByQuiz(quizId) {
	const [rows] = await pool.query(
		`SELECT i.id_estudiante, r.id_pregunta, r.es_correcta
		 FROM tblh_respuestas r JOIN tblh_intentos i ON i.id = r.id_intento
		 WHERE i.id_cuestionario = ?`,
		[quizId],
	);
	return rows;
}

// Dominio por tema de un estudiante, calculado por el tema de cada pregunta respondida.
async function topicMastery(studentId, teacherId = null) {
	const [rows] = await pool.query(
		`SELECT t.id, t.nombre AS tema, COUNT(*) AS respuestas, SUM(r.es_correcta) AS correctas
		 FROM tblh_respuestas r
		 JOIN tblh_intentos i ON i.id = r.id_intento
		 JOIN tblh_cuestionarios c ON c.id = i.id_cuestionario
		 JOIN tblh_preguntas p ON p.id = r.id_pregunta
		 JOIN tbld_temas t ON t.id = p.id_tema
		 WHERE i.id_estudiante = ? AND (? IS NULL OR c.id_docente = ?)
		 GROUP BY t.id, t.nombre, t.orden
		 ORDER BY t.orden`,
		[studentId, teacherId, teacherId],
	);
	return rows;
}

async function attemptsByStudent(studentId, teacherId = null) {
	const [rows] = await pool.query(
		`SELECT c.id AS id_cuestionario, c.titulo, t.nombre AS tema, i.correctas, i.total,
				DATE_FORMAT(i.fecha_envio, '%Y-%m-%d %H:%i') AS fecha_envio
		 FROM tblh_intentos i
		 JOIN tblh_cuestionarios c ON c.id = i.id_cuestionario
		 JOIN tbld_temas t ON t.id = c.id_tema
		 WHERE i.id_estudiante = ? AND c.estado = 1 AND (? IS NULL OR c.id_docente = ?)
		 ORDER BY i.fecha_envio DESC`,
		[studentId, teacherId, teacherId],
	);
	return rows;
}

async function countPendingForStudent(studentId, teacherId) {
	const [rows] = await pool.query(
		`SELECT COUNT(*) AS pendientes FROM tblh_cuestionarios c
		 LEFT JOIN tblh_intentos i ON i.id_cuestionario = c.id AND i.id_estudiante = ?
		 WHERE c.estado = 1 AND c.publicado = 1 AND c.id_docente = ? AND c.fecha_apertura <= NOW() AND NOW() < c.fecha_cierre AND i.id IS NULL`,
		[studentId, teacherId],
	);
	return Number(rows[0]?.pendientes) || 0;
}

module.exports = {
	listTopics,
	findTopic,
	listOptions,
	listBank,
	findQuestion,
	findUsableQuestionIds,
	insertQuestion,
	updateQuestion,
	replaceOptions,
	softDeleteQuestion,
	listForTeacher,
	findQuiz,
	listQuizQuestions,
	insertQuiz,
	updateQuiz,
	updatePublishedQuiz,
	replaceQuizQuestions,
	publish,
	archive,
	listForStudent,
	isEligible,
	findAttempt,
	listAttemptAnswers,
	insertAttempt,
	optionCounts,
	listAssignedStudents,
	answersByQuiz,
	topicMastery,
	attemptsByStudent,
	countPendingForStudent,
};
