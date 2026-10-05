// Cuestionarios: banco, pregunta propia, publicación, respuestas, resultados, CSV y cierre.
import { createReport, login, call, localInput, RUN } from './_lib.mjs';

export default async function run() {
	const report = createReport('Cuestionarios');
	const { check } = report;
	const teacher = (await login('marruiz')).cookie;
	const student = (await login('dpaniagua')).cookie;
	const student2 = (await login('juan.tamayo')).cookie;
	const outsider = (await login('danielviloria')).cookie;

	const topics = (await call(teacher, '/api/docente/temas')).body;
	check('6 temas', topics?.length === 6);
	const riego = topics.find((topic) => topic.codigo === 'riego');
	const bank = (await call(teacher, `/api/docente/banco?id_tema=${riego.id}`)).body;
	const system = bank.filter((question) => !question.propia);
	check('banco del sistema (5 de riego) con respuesta correcta', system.length === 5 && system.every((question) => question.opciones.some((option) => option.es_correcta)));
	const own = await call(teacher, '/api/docente/banco', { method: 'POST', body: { id_tema: riego.id, tipo: 'opcion_multiple', enunciado: `Pregunta propia ${RUN} 🌱`, opciones: [{ texto: 'Correcta', es_correcta: true }, { texto: 'Incorrecta' }] } });
	check('crear pregunta propia', own.status === 201);
	check('valida exactamente una correcta', (await call(teacher, '/api/docente/banco', { method: 'POST', body: { id_tema: riego.id, tipo: 'opcion_multiple', enunciado: 'x', opciones: [{ texto: 'a', es_correcta: true }, { texto: 'b', es_correcta: true }] } })).status === 400);
	check('no se editan preguntas del sistema (403)', (await call(teacher, `/api/docente/banco/${system[0].id}`, { method: 'PUT', body: { id_tema: riego.id, tipo: 'verdadero_falso', enunciado: 'x', respuesta_correcta: true } })).status === 403);

	const now = new Date();
	const quiz = await call(teacher, '/api/docente/cuestionarios', { method: 'POST', body: { titulo: `Prueba ${RUN}`, id_tema: riego.id, fecha_apertura: localInput(new Date(now - 3600e3)), fecha_cierre: localInput(new Date(+now + 86400e3)), preguntas: [system[0].id, system[1].id, own.body.id] } });
	check('crear borrador', quiz.status === 201);
	const quizId = quiz.body.id;
	check('el estudiante no ve borradores', (await call(student, '/api/cuestionarios')).body.every((item) => item.id !== quizId));
	check('publicar', (await call(teacher, `/api/docente/cuestionarios/${quizId}/publicar`, { method: 'POST' })).status === 200);
	check('pregunta en uso no se edita (409)', (await call(teacher, `/api/docente/banco/${own.body.id}`, { method: 'PUT', body: { id_tema: riego.id, tipo: 'verdadero_falso', enunciado: 'x', respuesta_correcta: true } })).status === 409);

	const open = await call(student, `/api/cuestionarios/${quizId}`);
	check('el estudiante lo abre sin ver respuestas correctas', open.status === 200 && !open.buffer.toString().includes('es_correcta') && open.body.puede_responder);
	check('el docente no usa la ruta del estudiante (403)', (await call(teacher, `/api/cuestionarios/${quizId}`)).status === 403);
	check('exige responder todas (400)', (await call(student, `/api/cuestionarios/${quizId}/respuestas`, { method: 'POST', body: { respuestas: [{ id_pregunta: open.body.preguntas[0].id, id_opcion: open.body.preguntas[0].opciones[0].id }] } })).status === 400);
	const answers = open.body.preguntas.map((question) => ({ id_pregunta: question.id, id_opcion: question.opciones[0].id }));
	const submitted = await call(student, `/api/cuestionarios/${quizId}/respuestas`, { method: 'POST', body: { respuestas: answers } });
	check('enviar respuestas (201)', submitted.status === 201, JSON.stringify(submitted.body));
	check('segundo intento rechazado (409)', (await call(student, `/api/cuestionarios/${quizId}/respuestas`, { method: 'POST', body: { respuestas: answers } })).status === 409);
	const open2 = (await call(student2, `/api/cuestionarios/${quizId}`)).body;
	check('otro estudiante responde', (await call(student2, `/api/cuestionarios/${quizId}/respuestas`, { method: 'POST', body: { respuestas: open2.preguntas.map((question) => ({ id_pregunta: question.id, id_opcion: question.opciones.at(-1).id })) } })).status === 201);

	const results = await call(teacher, `/api/docente/cuestionarios/${quizId}/resultados`);
	check('resultados: 2 respondieron', results.body?.resumen.respondieron === 2, JSON.stringify(results.body?.resumen));
	check('acierto por pregunta calculado', results.body?.preguntas.every((question) => question.respuestas === 2 && question.pct_acierto !== null));
	const csv = await call(teacher, `/api/docente/cuestionarios/${quizId}/resultados.csv`);
	check('CSV de resultados', csv.status === 200 && csv.buffer.toString('utf8').includes('Respondido'));
	check('dominio por tema en la ficha', (await call(teacher, '/api/docente/proyectos/2/cuestionarios')).body?.temas.length > 0);
	check('otro docente/estudiante no ve resultados', (await call(outsider, `/api/docente/cuestionarios/${quizId}/resultados`)).status === 403);

	check('el docente adelanta el cierre', (await call(teacher, `/api/docente/cuestionarios/${quizId}`, { method: 'PUT', body: { fecha_cierre: localInput(new Date(now - 60e3)) } })).status === 200);
	const review = (await call(student, `/api/cuestionarios/${quizId}`)).body;
	check('tras el cierre se ven correctas y explicaciones', review.respuestas_visibles && review.preguntas.every((question) => question.opciones.some((option) => option.es_correcta)));
	check('archivar', (await call(teacher, `/api/docente/cuestionarios/${quizId}`, { method: 'DELETE' })).status === 200);
	return report.print();
}

if (import.meta.url === `file:///${process.argv[1].replaceAll('\\', '/')}`) run().then((failed) => process.exit(failed ? 1 : 0));
