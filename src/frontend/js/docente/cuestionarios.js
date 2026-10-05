import { api } from '../lib/api.js';
import { escapeHtml } from '../lib/html.js';
import { fullName } from './formato.js';
import { openModal } from './gestion.js';

// Cuestionarios del docente: lista (#cuestionarios), editor (#cuestionario/nuevo,
// #cuestionario/<id>/editar) y resultados (#cuestionario/<id>).
const view = document.getElementById('view-quizzes');
let topicsCache = null;

async function topics() {
	if (!topicsCache) topicsCache = await api('/api/docente/temas');
	return topicsCache;
}

function formatDateTime(value) {
	if (!value) return '';
	const date = new Date(String(value).replace(' ', 'T'));
	return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

function toInputValue(date) {
	const pad = (number) => String(number).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function quizState(quiz) {
	if (!quiz.publicado) return ['is-draft', 'Borrador'];
	if (quiz.cerrado) return ['is-closed', 'Cerrado'];
	if (!quiz.iniciado) return ['is-scheduled', 'Programado'];
	return ['is-open', 'Abierto'];
}

function stateBadge(quiz) {
	const [className, label] = quizState(quiz);
	return `<span class="quiz-state ${className}">${label}</span>`;
}

function scoreClass(pct) {
	if (pct === null || pct === undefined) return '';
	return pct < 50 ? 'is-low' : pct < 75 ? 'is-mid' : 'is-high';
}

function showError(error) {
	view.innerHTML = `<a class="secondary-btn back-link" href="#cuestionarios"><i class="ti ti-arrow-left" aria-hidden="true"></i>Volver a cuestionarios</a><p class="form-error" style="display:block">${escapeHtml(error.message)}</p>`;
}

// --- Lista ---

export async function showQuizList() {
	view.innerHTML = '<p class="card-help">Cargando cuestionarios…</p>';
	let quizzes;
	try {
		quizzes = await api('/api/docente/cuestionarios');
	} catch (error) {
		showError(error);
		return;
	}
	const rows = quizzes.map((quiz) => `<tr>
		<td>${escapeHtml(quiz.titulo)}<small>${escapeHtml(quiz.tema)} · ${quiz.total_preguntas} preguntas</small></td>
		<td>${stateBadge(quiz)}</td>
		<td>${escapeHtml(formatDateTime(quiz.fecha_apertura))}<small>hasta ${escapeHtml(formatDateTime(quiz.fecha_cierre))}</small></td>
		<td>${quiz.publicado ? `${quiz.respondieron}/${quiz.asignados}` : '–'}</td>
		<td>${quiz.promedio_pct === null ? '–' : `<span class="question-score ${scoreClass(quiz.promedio_pct)}">${quiz.promedio_pct}%</span>`}</td>
		<td><div class="device-dots">
			${quiz.publicado ? `<a class="secondary-btn" href="#cuestionario/${Number(quiz.id)}">Resultados</a>` : ''}
			<a class="secondary-btn" href="#cuestionario/${Number(quiz.id)}/editar">${quiz.publicado ? 'Ajustar' : 'Editar'}</a>
			${quiz.publicado ? '' : `<button type="button" class="secondary-btn" data-publish="${Number(quiz.id)}">Publicar</button>`}
			<button type="button" class="secondary-btn danger-btn" data-archive="${Number(quiz.id)}" data-title="${escapeHtml(quiz.titulo)}">Archivar</button>
		</div></td>
	</tr>`).join('');
	view.innerHTML = `<section class="project-banner teacher-banner"><div><span class="eyebrow">Evaluación por tema</span><h1>Cuestionarios</h1><p>Arma cuestionarios con el banco de preguntas o con las tuyas. Los reciben todos los estudiantes que te eligieron como docente.</p></div><i class="ti ti-help-hexagon" aria-hidden="true"></i></section>
		<section class="teacher-panel">
			<div class="card-header teacher-toolbar"><div><span class="eyebrow">Tus cuestionarios</span><h2 class="section-title">Borradores y publicados</h2></div><a class="save-btn compact-action" href="#cuestionario/nuevo"><i class="ti ti-plus" aria-hidden="true"></i>Nuevo cuestionario</a></div>
			<p class="card-help" id="quiz-list-message" role="status"></p>
			<div class="student-table-wrap"><table class="student-table teacher-table quiz-table">
				<thead><tr><th>Cuestionario</th><th>Estado</th><th>Fechas</th><th>Respondieron</th><th>Promedio</th><th><span class="sr-only">Acciones</span></th></tr></thead>
				<tbody>${rows || '<tr><td colspan="6" class="table-empty">Aún no has creado cuestionarios. Empieza con “Nuevo cuestionario”.</td></tr>'}</tbody>
			</table></div>
		</section>`;
	const message = view.querySelector('#quiz-list-message');
	view.querySelector('tbody').addEventListener('click', async (event) => {
		const publish = event.target.closest('[data-publish]');
		const archive = event.target.closest('[data-archive]');
		try {
			if (publish && window.confirm('¿Publicar el cuestionario? Después ya no podrás cambiar sus preguntas.')) {
				await api(`/api/docente/cuestionarios/${publish.dataset.publish}/publicar`, { method: 'POST' });
				await showQuizList();
			}
			if (archive && window.confirm(`¿Archivar "${archive.dataset.title}"? Los estudiantes dejarán de verlo.`)) {
				await api(`/api/docente/cuestionarios/${archive.dataset.archive}`, { method: 'DELETE' });
				await showQuizList();
			}
		} catch (error) {
			message.textContent = error.message;
		}
	});
}

// --- Editor ---

function questionForm(topicList, question = null, defaultTopic = null) {
	const tipo = question?.tipo || 'opcion_multiple';
	const options = question?.tipo === 'opcion_multiple' ? question.opciones : [{ texto: '', es_correcta: true }, { texto: '' }, { texto: '' }, { texto: '' }];
	const vfCorrect = question?.tipo === 'verdadero_falso' ? (question.opciones.find((option) => option.es_correcta)?.texto === 'Verdadero' ? 'verdadero' : 'falso') : 'verdadero';
	return `<div class="two-fields">
			<div class="form-row"><label class="form-label" for="qf-topic">Tema</label><select id="qf-topic" name="id_tema">${topicList.map((topic) => `<option value="${topic.id}"${Number(topic.id) === Number(question?.id_tema || defaultTopic) ? ' selected' : ''}>${escapeHtml(topic.nombre)}</option>`).join('')}</select></div>
			<div class="form-row"><label class="form-label" for="qf-type">Tipo</label><select id="qf-type" name="tipo"><option value="opcion_multiple"${tipo === 'opcion_multiple' ? ' selected' : ''}>Opción múltiple</option><option value="verdadero_falso"${tipo === 'verdadero_falso' ? ' selected' : ''}>Verdadero o falso</option></select></div>
		</div>
		<div class="form-row"><label class="form-label" for="qf-statement">Enunciado</label><textarea id="qf-statement" name="enunciado" rows="2" maxlength="500" required>${escapeHtml(question?.enunciado || '')}</textarea></div>
		<div class="form-row" id="qf-multiple"><span class="form-label">Opciones (marca la correcta; deja vacías las que no uses)</span>
			${Array.from({ length: 5 }, (_, index) => `<div class="option-editor"><input type="radio" name="correcta" value="${index}" aria-label="Opción ${index + 1} correcta"${options[index]?.es_correcta ? ' checked' : ''}><input type="text" name="opcion-${index}" maxlength="255" placeholder="Opción ${index + 1}" value="${escapeHtml(options[index]?.texto || '')}"></div>`).join('')}
		</div>
		<div class="form-row" id="qf-truefalse"><label class="form-label" for="qf-vf">Respuesta correcta</label><select id="qf-vf" name="respuesta_vf"><option value="verdadero"${vfCorrect === 'verdadero' ? ' selected' : ''}>Verdadero</option><option value="falso"${vfCorrect === 'falso' ? ' selected' : ''}>Falso</option></select></div>
		<div class="form-row"><label class="form-label" for="qf-explanation">Explicación (se muestra al estudiante cuando cierra el cuestionario)</label><textarea id="qf-explanation" name="explicacion" rows="2" maxlength="500">${escapeHtml(question?.explicacion || '')}</textarea></div>`;
}

function readQuestionForm(form) {
	const tipo = form.get('tipo');
	const body = { id_tema: Number(form.get('id_tema')), tipo, enunciado: form.get('enunciado'), explicacion: form.get('explicacion') };
	if (tipo === 'verdadero_falso') return { ...body, respuesta_correcta: form.get('respuesta_vf') };
	const correct = Number(form.get('correcta'));
	return { ...body, opciones: Array.from({ length: 5 }, (_, index) => ({ texto: String(form.get(`opcion-${index}`) || '').trim(), es_correcta: index === correct })).filter((option) => option.texto) };
}

function bindQuestionFormType() {
	const modalForm = document.getElementById('teacher-modal-form');
	const typeSelect = modalForm.querySelector('#qf-type');
	const sync = () => {
		modalForm.querySelector('#qf-multiple').hidden = typeSelect.value !== 'opcion_multiple';
		modalForm.querySelector('#qf-truefalse').hidden = typeSelect.value !== 'verdadero_falso';
	};
	typeSelect.addEventListener('change', sync);
	sync();
}

export async function showQuizEditor(quizId = null) {
	view.innerHTML = '<p class="card-help">Cargando editor…</p>';
	let quiz = null;
	let topicList;
	try {
		[topicList, quiz] = await Promise.all([topics(), quizId ? api(`/api/docente/cuestionarios/${quizId}`) : null]);
	} catch (error) {
		showError(error);
		return;
	}
	const locked = Boolean(quiz?.publicado);
	const now = new Date();
	const selected = (quiz?.preguntas || []).map((question) => question.id);
	const bankTopic = { value: quiz?.id_tema || topicList[0]?.id };

	view.innerHTML = `<a class="secondary-btn back-link" href="#cuestionarios"><i class="ti ti-arrow-left" aria-hidden="true"></i>Volver a cuestionarios</a>
		<form id="quiz-editor" class="quiz-sheet">
			<article class="card">
				<div class="card-header"><h2 class="card-title"><i class="ti ti-file-pencil" aria-hidden="true"></i>${quiz ? (locked ? 'Ajustar cuestionario publicado' : 'Editar borrador') : 'Nuevo cuestionario'}</h2>${quiz ? stateBadge(quiz) : ''}</div>
				${locked ? '<p class="card-help">Ya está publicado: solo puedes cambiar el título, la descripción y la fecha de cierre. Las preguntas quedan fijas para que los resultados sean comparables.</p>' : ''}
				<div class="two-fields">
					<div class="form-row"><label class="form-label" for="qe-title">Título</label><input type="text" id="qe-title" name="titulo" maxlength="150" required value="${escapeHtml(quiz?.titulo || '')}" placeholder="Ej: Repaso de riego y humedad"></div>
					<div class="form-row"><label class="form-label" for="qe-topic">Tema principal</label><select id="qe-topic" name="id_tema"${locked ? ' disabled' : ''}>${topicList.map((topic) => `<option value="${topic.id}"${Number(topic.id) === Number(quiz?.id_tema) ? ' selected' : ''}>${escapeHtml(topic.nombre)}</option>`).join('')}</select></div>
				</div>
				<div class="form-row"><label class="form-label" for="qe-description">Instrucciones para el estudiante (opcional)</label><textarea id="qe-description" name="descripcion" rows="2" maxlength="500">${escapeHtml(quiz?.descripcion || '')}</textarea></div>
				<div class="two-fields">
					<div class="form-row"><label class="form-label" for="qe-open">Abre</label><input type="datetime-local" id="qe-open" name="fecha_apertura" required value="${quiz ? quiz.fecha_apertura.replace(' ', 'T') : toInputValue(now)}"${locked ? ' disabled' : ''}></div>
					<div class="form-row"><label class="form-label" for="qe-close">Cierra (ahí se muestran las respuestas correctas)</label><input type="datetime-local" id="qe-close" name="fecha_cierre" required value="${quiz ? quiz.fecha_cierre.replace(' ', 'T') : toInputValue(new Date(+now + 7 * 86400000))}"></div>
				</div>
			</article>
			<article class="card">
				<div class="card-header teacher-toolbar">
					<div><h2 class="card-title"><i class="ti ti-list-check" aria-hidden="true"></i>Preguntas <span class="chip" id="qe-count">${selected.length} seleccionadas</span></h2></div>
					${locked ? '' : `<div class="toolbar-controls"><div class="form-row inline-field"><label class="sr-only" for="qe-bank-topic">Tema del banco</label><select id="qe-bank-topic">${topicList.map((topic) => `<option value="${topic.id}"${Number(topic.id) === Number(bankTopic.value) ? ' selected' : ''}>${escapeHtml(topic.nombre)}</option>`).join('')}</select></div><button type="button" class="secondary-btn" id="qe-new-question"><i class="ti ti-plus" aria-hidden="true"></i>Nueva pregunta</button></div>`}
				</div>
				<div id="qe-bank" class="bank-list"></div>
			</article>
			<div class="form-error" id="qe-error" role="alert"></div>
			<div class="quiz-actions">
				<button type="submit" class="save-btn"><i class="ti ti-device-floppy" aria-hidden="true"></i>${locked ? 'Guardar cambios' : 'Guardar borrador'}</button>
				${locked ? '' : '<button type="button" class="secondary-btn" id="qe-save-publish"><i class="ti ti-send" aria-hidden="true"></i>Guardar y publicar</button>'}
			</div>
		</form>`;

	const form = view.querySelector('#quiz-editor');
	const bankBox = view.querySelector('#qe-bank');
	const count = view.querySelector('#qe-count');
	const error = view.querySelector('#qe-error');

	async function renderBank() {
		if (locked) {
			bankBox.innerHTML = quiz.preguntas.map((question, index) => `<div class="bank-item"><span class="quiz-question-number">${index + 1}</span><div><strong>${escapeHtml(question.enunciado)}</strong><small>${escapeHtml(question.tema)} · Correcta: <span class="bank-correct">${escapeHtml(question.opciones.find((option) => option.es_correcta)?.texto || '')}</span></small></div><span></span></div>`).join('');
			return;
		}
		bankBox.innerHTML = '<p class="card-help">Cargando banco…</p>';
		const bank = await api(`/api/docente/banco?id_tema=${bankTopic.value}`);
		const selectedOutsideTopic = selected.filter((id) => !bank.some((question) => question.id === id)).length;
		bankBox.innerHTML = (selectedOutsideTopic ? `<p class="card-help">${selectedOutsideTopic} pregunta(s) seleccionada(s) de otros temas se mantienen en el cuestionario.</p>` : '')
			+ (bank.map((question) => `<label class="bank-item"><input type="checkbox" value="${question.id}"${selected.includes(question.id) ? ' checked' : ''}><div><strong>${escapeHtml(question.enunciado)}</strong><small>${question.propia ? 'Tu pregunta' : 'Banco Rural 4.0'} · ${question.tipo === 'verdadero_falso' ? 'Verdadero/falso' : `${question.opciones.length} opciones`} · Correcta: <span class="bank-correct">${escapeHtml(question.opciones.find((option) => option.es_correcta)?.texto || '')}</span></small></div>${question.propia && !question.en_uso ? `<span class="bank-item-actions"><button type="button" data-edit-question="${question.id}">Editar</button><button type="button" data-delete-question="${question.id}">Eliminar</button></span>` : '<span></span>'}</label>`).join('') || '<p class="card-help">No hay preguntas de este tema. Crea una con “Nueva pregunta”.</p>');
		bankBox.onchange = (event) => {
			const checkbox = event.target.closest('input[type="checkbox"]');
			if (!checkbox) return;
			const id = Number(checkbox.value);
			if (checkbox.checked && !selected.includes(id)) selected.push(id);
			if (!checkbox.checked) selected.splice(selected.indexOf(id), 1);
			count.textContent = `${selected.length} seleccionadas`;
		};
		bankBox.onclick = async (event) => {
			const edit = event.target.closest('[data-edit-question]');
			const remove = event.target.closest('[data-delete-question]');
			if (!edit && !remove) return;
			event.preventDefault();
			const question = bank.find((item) => item.id === Number((edit || remove).dataset.editQuestion || (edit || remove).dataset.deleteQuestion));
			if (remove) {
				if (!window.confirm('¿Eliminar esta pregunta de tu banco?')) return;
				await api(`/api/docente/banco/${question.id}`, { method: 'DELETE' });
				if (selected.includes(question.id)) selected.splice(selected.indexOf(question.id), 1);
				count.textContent = `${selected.length} seleccionadas`;
				await renderBank();
				return;
			}
			openModal('Editar pregunta', questionForm(topicList, question), 'Guardar pregunta', async (data) => {
				await api(`/api/docente/banco/${question.id}`, { method: 'PUT', body: readQuestionForm(data) });
				await renderBank();
			}, 'Banco de preguntas');
			bindQuestionFormType();
		};
	}

	view.querySelector('#qe-bank-topic')?.addEventListener('change', (event) => { bankTopic.value = Number(event.target.value); renderBank(); });
	view.querySelector('#qe-topic')?.addEventListener('change', (event) => {
		const bankSelect = view.querySelector('#qe-bank-topic');
		if (bankSelect) { bankSelect.value = event.target.value; bankTopic.value = Number(event.target.value); renderBank(); }
	});
	view.querySelector('#qe-new-question')?.addEventListener('click', () => {
		openModal('Nueva pregunta', questionForm(topicList, null, bankTopic.value), 'Crear pregunta', async (data) => {
			const created = await api('/api/docente/banco', { method: 'POST', body: readQuestionForm(data) });
			selected.push(created.id);
			count.textContent = `${selected.length} seleccionadas`;
			await renderBank();
		}, 'Banco de preguntas');
		bindQuestionFormType();
	});

	async function save(publishAfter) {
		error.style.display = 'none';
		const data = new FormData(form);
		const body = locked
			? { titulo: data.get('titulo'), descripcion: data.get('descripcion'), fecha_cierre: data.get('fecha_cierre') }
			: { titulo: data.get('titulo'), descripcion: data.get('descripcion'), id_tema: Number(data.get('id_tema')), fecha_apertura: data.get('fecha_apertura'), fecha_cierre: data.get('fecha_cierre'), preguntas: selected };
		try {
			const saved = quiz
				? await api(`/api/docente/cuestionarios/${quiz.id}`, { method: 'PUT', body })
				: await api('/api/docente/cuestionarios', { method: 'POST', body });
			if (publishAfter) {
				if (!window.confirm('¿Publicar el cuestionario? Después ya no podrás cambiar sus preguntas.')) {
					window.location.hash = `#cuestionario/${saved.id}/editar`;
					return;
				}
				await api(`/api/docente/cuestionarios/${saved.id}/publicar`, { method: 'POST' });
			}
			window.location.hash = '#cuestionarios';
		} catch (failure) {
			error.textContent = failure.message;
			error.style.display = 'block';
		}
	}

	form.addEventListener('submit', (event) => { event.preventDefault(); save(false); });
	view.querySelector('#qe-save-publish')?.addEventListener('click', () => { if (form.reportValidity()) save(true); });
	try {
		await renderBank();
	} catch (failure) {
		bankBox.innerHTML = `<p class="form-error" style="display:block">${escapeHtml(failure.message)}</p>`;
	}
}

// --- Resultados ---

export async function showQuizResults(quizId) {
	view.innerHTML = '<p class="card-help">Cargando resultados…</p>';
	let data;
	try {
		data = await api(`/api/docente/cuestionarios/${quizId}/resultados`);
	} catch (error) {
		showError(error);
		return;
	}
	const { cuestionario: quiz, resumen, preguntas, estudiantes } = data;
	const hardest = preguntas.filter((question) => question.respuestas).sort((first, second) => first.pct_acierto - second.pct_acierto)[0];
	view.innerHTML = `<a class="secondary-btn back-link" href="#cuestionarios"><i class="ti ti-arrow-left" aria-hidden="true"></i>Volver a cuestionarios</a>
		<section class="project-banner"><div><span class="eyebrow">${escapeHtml(quiz.tema)}</span><h1>${escapeHtml(quiz.titulo)}</h1><p>${escapeHtml(formatDateTime(quiz.fecha_apertura))} → ${escapeHtml(formatDateTime(quiz.fecha_cierre))}</p></div>${stateBadge(quiz)}</section>
		<section class="teacher-stats teacher-stats-wide">
			<article class="teacher-stat"><i class="ti ti-users" aria-hidden="true"></i><strong>${resumen.asignados}</strong><span>Estudiantes asignados</span></article>
			<article class="teacher-stat"><i class="ti ti-circle-check" aria-hidden="true"></i><strong>${resumen.respondieron}</strong><span>Respondieron</span></article>
			<article class="teacher-stat"><i class="ti ti-clock" aria-hidden="true"></i><strong>${resumen.pendientes}</strong><span>Pendientes</span></article>
			<article class="teacher-stat"><i class="ti ti-percentage" aria-hidden="true"></i><strong>${resumen.promedio_pct === null ? '–' : `${resumen.promedio_pct}%`}</strong><span>Promedio</span></article>
			<article class="teacher-stat teacher-stat-alert"><i class="ti ti-alert-triangle" aria-hidden="true"></i><strong>${hardest ? `${hardest.pct_acierto}%` : '–'}</strong><span>Pregunta con menos aciertos</span></article>
		</section>
		<div class="quiz-actions" style="margin-bottom:1rem"><a class="secondary-btn" href="/api/docente/cuestionarios/${Number(quiz.id)}/resultados.csv" download><i class="ti ti-file-spreadsheet" aria-hidden="true"></i>Exportar resultados (CSV)</a></div>
		<article class="card teacher-card-block">
			<div class="card-header"><h2 class="card-title"><i class="ti ti-chart-bar" aria-hidden="true"></i>Acierto por pregunta</h2></div>
			<p class="card-help">Las preguntas con menos aciertos muestran qué concepto conviene reforzar en clase. En cada una se ve qué opción eligieron los estudiantes.</p>
			<div class="quiz-sheet" style="margin-top:12px">${preguntas.map((question, index) => `<div class="quiz-question">
				<div class="quiz-question-title"><span class="quiz-question-number">${index + 1}</span><span>${escapeHtml(question.enunciado)}</span><span class="question-score ${scoreClass(question.pct_acierto)}">${question.pct_acierto === null ? 'Sin respuestas' : `${question.pct_acierto}% acierto`}</span></div>
				<div class="result-bars">${question.opciones.map((option) => {
					const share = question.respuestas ? Math.round((option.conteo / question.respuestas) * 100) : 0;
					return `<div class="result-bar"><div class="${option.es_correcta ? 'is-correct' : ''}"><div class="result-bar-label${option.es_correcta ? ' is-correct' : ''}">${option.es_correcta ? '<i class="ti ti-check" aria-hidden="true"></i>' : ''}${escapeHtml(option.texto)}</div><div class="result-bar-track"><div class="result-bar-fill" style="width:${share}%"></div></div></div><span class="result-bar-count">${option.conteo} (${share}%)</span></div>`;
				}).join('')}</div>
			</div>`).join('')}</div>
		</article>
		<section class="teacher-panel">
			<div class="card-header"><div><span class="eyebrow">Por estudiante</span><h2 class="section-title">Participación y puntaje</h2></div></div>
			<div class="student-table-wrap"><table class="student-table teacher-table">
				<thead><tr><th>Estudiante</th><th>Estado</th><th>Puntaje</th><th>Enviado</th></tr></thead>
				<tbody>${estudiantes.map((student) => `<tr><td>${escapeHtml(fullName(student))}<small>@${escapeHtml(student.usuario)}</small></td><td>${student.respondido ? '<span class="quiz-state is-done">Respondido</span>' : '<span class="quiz-state is-pending">Pendiente</span>'}</td><td>${student.respondido ? `<span class="question-score ${scoreClass(student.pct)}">${student.correctas}/${student.total} · ${student.pct}%</span>` : '–'}</td><td>${escapeHtml(formatDateTime(student.fecha_envio)) || '–'}</td></tr>`).join('') || '<tr><td colspan="4" class="table-empty">No hay estudiantes asignados.</td></tr>'}</tbody>
			</table></div>
		</section>`;
}

// --- Ficha del proyecto: cuestionarios del estudiante ---

export async function renderStudentQuizzes(container, projectId) {
	container.innerHTML = '<p class="card-help">Cargando…</p>';
	try {
		const data = await api(`/api/docente/proyectos/${projectId}/cuestionarios`);
		const mastery = data.temas.length
			? `<div class="mastery-list">${data.temas.map((topic) => `<div class="mastery-row"><span>${escapeHtml(topic.tema)}</span><div class="result-bar-track"><div class="result-bar-fill" style="width:${topic.pct}%;background:${topic.pct < 50 ? '#c0584a' : topic.pct < 75 ? '#d39a18' : '#639922'}"></div></div><strong class="question-score ${scoreClass(topic.pct)}">${topic.pct}%</strong></div>`).join('')}</div>`
			: '<p class="card-help">Todavía no ha respondido cuestionarios.</p>';
		const attempts = data.intentos.map((attempt) => `<li><a href="#cuestionario/${Number(attempt.id_cuestionario)}">${escapeHtml(attempt.titulo)}</a> · ${escapeHtml(attempt.tema)} · <span class="question-score ${scoreClass(attempt.pct)}">${attempt.correctas}/${attempt.total}</span> · ${escapeHtml(formatDateTime(attempt.fecha_envio))}</li>`).join('');
		container.innerHTML = `<p class="card-help">Dominio por tema (según el tema de cada pregunta respondida)${data.pendientes ? ` · <strong>${data.pendientes} cuestionario(s) abierto(s) sin responder</strong>` : ''}</p>
			<div style="margin-top:10px">${mastery}</div>
			${attempts ? `<ul class="timeline-entry" style="margin-top:12px;padding-left:18px">${attempts}</ul>` : ''}`;
	} catch (error) {
		container.innerHTML = `<p class="card-help">${escapeHtml(error.message)}</p>`;
	}
}
