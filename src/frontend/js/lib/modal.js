import { escapeHtml } from './html.js';

// Modal de formulario reutilizable. onSubmit(FormData, form) puede lanzar un Error: su
// mensaje se muestra dentro del modal y el formulario queda abierto para corregir.
let backdrop;
let titleElement;
let eyebrowElement;
let form;
let submitHandler = null;

function ensureModal() {
	if (backdrop) return;
	backdrop = document.createElement('div');
	backdrop.className = 'project-modal-backdrop';
	backdrop.hidden = true;
	backdrop.innerHTML = `<section class="project-modal" role="dialog" aria-modal="true" aria-labelledby="app-modal-title">
		<button class="project-modal-close" type="button" aria-label="Cerrar"><i class="ti ti-x" aria-hidden="true"></i></button>
		<div class="project-modal-title-row"><span class="eyebrow"></span><h2 class="project-modal-title" id="app-modal-title"></h2></div>
		<form></form>
	</section>`;
	document.body.append(backdrop);
	titleElement = backdrop.querySelector('.project-modal-title');
	eyebrowElement = backdrop.querySelector('.eyebrow');
	form = backdrop.querySelector('form');
	backdrop.querySelector('.project-modal-close').addEventListener('click', closeModal);
	backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeModal(); });
	document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !backdrop.hidden) closeModal(); });
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (!submitHandler) return;
		const error = form.querySelector('.form-error');
		const button = form.querySelector('[type="submit"]');
		error.style.display = 'none';
		button.disabled = true;
		try {
			const keepOpen = await submitHandler(new FormData(form), form);
			if (!keepOpen) closeModal();
			else button.disabled = false;
		} catch (failure) {
			error.textContent = failure.message;
			error.style.display = 'block';
			button.disabled = false;
		}
	});
}

export function closeModal() {
	if (!backdrop) return;
	backdrop.hidden = true;
	form.innerHTML = '';
	submitHandler = null;
}

// Si onSubmit devuelve true, el modal no se cierra (útil para mostrar un resultado).
export function openModal({ eyebrow = '', title, body, submitLabel = 'Guardar', onSubmit }) {
	ensureModal();
	eyebrowElement.textContent = eyebrow;
	titleElement.textContent = title;
	form.innerHTML = `${body}<div class="form-error" role="alert"></div><div class="modal-actions-row"><button class="secondary-btn" type="button" data-close>Cancelar</button>${onSubmit ? `<button class="save-btn" type="submit">${escapeHtml(submitLabel)}</button>` : ''}</div>`;
	form.querySelector('[data-close]').addEventListener('click', closeModal);
	submitHandler = onSubmit || null;
	backdrop.hidden = false;
	form.querySelector('input, select, textarea')?.focus();
	return form;
}
