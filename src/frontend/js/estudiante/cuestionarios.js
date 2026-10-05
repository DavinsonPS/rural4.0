import { api } from '../lib/api.js';
import { escapeHtml } from '../lib/html.js';

// Vista "Cuestionarios" del estudiante: lista, responder y revisar.
const container = document.getElementById('student-quizzes');
const navButton = document.querySelector('[data-view="quizzes"]');

function formatDateTime(value) {
	if (!value) return '';
	const date = new Date(String(value).replace(' ', 'T'));
	return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

function stateBadge(quiz) {
	if (quiz.respondido) return `<span class="quiz-state is-done"><i class="ti ti-circle-check" aria-hidden="true"></i>Respondido · ${quiz.correctas}/${quiz.total}</span>`;
	if (quiz.cerrado) return '<span class="quiz-state is-closed"><i class="ti ti-lock" aria-hidden="true"></i>Cerrado sin responder</span>';
	return '<span class="quiz-state is-pending"><i class="ti ti-clock" aria-hidden="true"></i>Pendiente</span>';
}

async function showList() {
	container.innerHTML = '<p class="card-help">Cargando cuestionarios…</p>';
	let quizzes;
	try {
		quizzes = await api('/api/cuestionarios');
	} catch (error) {
		container.innerHTML = `<p class="form-error" style="display:block">${escapeHtml(error.message)}</p>`;
		return;
	}
	if (!quizzes.length) {
		container.innerHTML = '<article class="card empty-view-card"><i class="ti ti-help-hexagon" aria-hidden="true"></i><h3>Aún no tienes cuestionarios</h3><p class="card-help">Cuando tu docente publique uno aparecerá aquí.</p></article>';
		return;
	}
	container.innerHTML = `<div class="quiz-grid">${quizzes.map((quiz) => `<article class="quiz-card">
		<div class="quiz-meta"><span class="chip">${escapeHtml(quiz.tema)}</span>${stateBadge(quiz)}</div>
		<h3>${escapeHtml(quiz.titulo)}</h3>
		${quiz.descripcion ? `<p>${escapeHtml(quiz.descripcion)}</p>` : ''}
		<div class="quiz-meta"><span><i class="ti ti-user" aria-hidden="true"></i> ${escapeHtml(quiz.docente)}</span><span>${quiz.total_preguntas} preguntas</span><span>${quiz.cerrado ? 'Cerró' : 'Cierra'}: ${escapeHtml(formatDateTime(quiz.fecha_cierre))}</span></div>
		<button type="button" class="${!quiz.respondido && !quiz.cerrado ? 'save-btn' : 'secondary-btn'}" data-quiz="${Number(quiz.id)}">${!quiz.respondido && !quiz.cerrado ? '<i class="ti ti-pencil" aria-hidden="true"></i>Responder' : '<i class="ti ti-eye" aria-hidden="true"></i>Ver'}</button>
	</article>`).join('')}</div>`;
}

function optionClass(question, option, quiz) {
	if (!quiz.respuestas_visibles) return '';
	if (option.es_correcta) return ' is-correct';
	return option.id === question.id_opcion_elegida ? ' is-wrong' : '';
}

function optionTag(question, option, quiz) {
	if (!quiz.respuestas_visibles) return option.id === question.id_opcion_elegida ? '<span class="quiz-option-tag">Tu respuesta</span>' : '';
	if (option.es_correcta) return `<span class="quiz-option-tag">${option.id === question.id_opcion_elegida ? 'Tu respuesta · Correcta' : 'Correcta'}</span>`;
	return option.id === question.id_opcion_elegida ? '<span class="quiz-option-tag">Tu respuesta</span>' : '';
}

function renderQuiz(quiz) {
	const editable = quiz.puede_responder;
	const result = quiz.resultado
		? `<div class="quiz-result"><strong>${quiz.resultado.correctas}/${quiz.resultado.total}</strong><span>${quiz.resultado.pct}% de respuestas correctas.<br>${quiz.respuestas_visibles ? 'Revisa abajo las respuestas correctas y la explicación de cada pregunta.' : `Las respuestas correctas se mostrarán cuando cierre el cuestionario (${escapeHtml(formatDateTime(quiz.fecha_cierre))}).`}</span></div>`
		: quiz.cerrado ? '<div class="quiz-result"><span>Este cuestionario cerró sin que lo respondieras. Puedes revisar las respuestas correctas para repasar.</span></div>' : '';
	container.innerHTML = `<div class="quiz-sheet">
		<div class="quiz-actions"><button type="button" class="secondary-btn" data-back><i class="ti ti-arrow-left" aria-hidden="true"></i>Volver a mis cuestionarios</button></div>
		<div class="quiz-header"><span class="eyebrow">${escapeHtml(quiz.tema)}</span><h2>${escapeHtml(quiz.titulo)}</h2>${quiz.descripcion ? `<p>${escapeHtml(quiz.descripcion)}</p>` : ''}<p>${quiz.preguntas.length} preguntas · ${quiz.cerrado ? 'Cerró' : 'Cierra'}: ${escapeHtml(formatDateTime(quiz.fecha_cierre))}${editable ? ' · Solo tienes un intento' : ''}</p></div>
		${result}
		<form id="quiz-form" class="quiz-sheet">
			${quiz.preguntas.map((question, index) => `<fieldset class="quiz-question">
				<legend><span class="quiz-question-number">${index + 1}</span><span>${escapeHtml(question.enunciado)}</span></legend>
				<div class="quiz-options">${question.opciones.map((option) => `<label class="quiz-option${optionClass(question, option, quiz)}"><input type="radio" name="q-${Number(question.id)}" value="${Number(option.id)}"${option.id === question.id_opcion_elegida ? ' checked' : ''}${editable ? '' : ' disabled'}>${escapeHtml(option.texto)}${optionTag(question, option, quiz)}</label>`).join('')}</div>
				${quiz.respuestas_visibles && question.explicacion ? `<p class="quiz-explanation"><i class="ti ti-bulb" aria-hidden="true"></i> ${escapeHtml(question.explicacion)}</p>` : ''}
			</fieldset>`).join('')}
			${editable ? '<div class="form-error" id="quiz-error" role="alert"></div><div class="quiz-actions"><button type="submit" class="save-btn"><i class="ti ti-send" aria-hidden="true"></i>Enviar respuestas</button></div>' : ''}
		</form>
	</div>`;
	container.querySelector('[data-back]').addEventListener('click', showList);
	if (!editable) return;
	const form = container.querySelector('#quiz-form');
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		const error = form.querySelector('#quiz-error');
		const answers = quiz.preguntas.map((question) => ({ id_pregunta: question.id, id_opcion: Number(form.querySelector(`input[name="q-${question.id}"]:checked`)?.value) || null }));
		const missing = answers.filter((answer) => !answer.id_opcion).length;
		if (missing) {
			error.textContent = `Te falta responder ${missing} pregunta${missing === 1 ? '' : 's'}.`;
			error.style.display = 'block';
			return;
		}
		if (!window.confirm('¿Enviar tus respuestas? Solo tienes un intento.')) return;
		const button = form.querySelector('[type="submit"]');
		button.disabled = true;
		try {
			const result = await api(`/api/cuestionarios/${quiz.id}/respuestas`, { method: 'POST', body: { respuestas: answers } });
			document.dispatchEvent(new CustomEvent('rural40:cuestionario-enviado', { detail: result }));
			await showQuiz(quiz.id);
		} catch (failure) {
			error.textContent = failure.message;
			error.style.display = 'block';
			button.disabled = false;
		}
	});
}

async function showQuiz(quizId) {
	container.innerHTML = '<p class="card-help">Abriendo cuestionario…</p>';
	try {
		renderQuiz(await api(`/api/cuestionarios/${quizId}`));
		window.scrollTo({ top: 0, behavior: 'smooth' });
	} catch (error) {
		container.innerHTML = `<p class="form-error" style="display:block">${escapeHtml(error.message)}</p>`;
	}
}

container?.addEventListener('click', (event) => {
	const button = event.target.closest('[data-quiz]');
	if (button) showQuiz(Number(button.dataset.quiz));
});
navButton?.addEventListener('click', showList);
