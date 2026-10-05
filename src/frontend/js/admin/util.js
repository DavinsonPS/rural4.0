import { escapeHtml } from '../lib/html.js';

export const view = () => document.getElementById('admin-view');

export function formatDateTime(value) {
	if (!value) return '–';
	const date = new Date(String(value).replace(' ', 'T'));
	return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatMinutes(minutes) {
	if (minutes === null || minutes === undefined) return 'nunca';
	const value = Number(minutes);
	if (value < 60) return `hace ${value} min`;
	if (value < 48 * 60) return `hace ${Math.round(value / 60)} h`;
	return `hace ${Math.round(value / 1440)} días`;
}

export function stateDot(active, labels = ['Activo', 'Inactivo']) {
	return `<span class="state-dot ${active ? 'is-on' : 'is-off'}">${active ? labels[0] : labels[1]}</span>`;
}

export function field(id, label, control, { full = false } = {}) {
	return `<div class="form-row${full ? ' full-field' : ''}"><label class="form-label" for="${id}">${escapeHtml(label)}</label>${control}</div>`;
}

export function input(id, name, value = '', attributes = '') {
	return `<input type="text" id="${id}" name="${name}" value="${escapeHtml(value ?? '')}" ${attributes}>`;
}

export function options(list, selected, { empty } = {}) {
	return (empty ? `<option value="">${escapeHtml(empty)}</option>` : '')
		+ list.map(([value, label]) => `<option value="${escapeHtml(value)}"${String(value) === String(selected ?? '') ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

export function header(eyebrow, title, description, icon) {
	return `<section class="project-banner teacher-banner"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div><i class="ti ti-${icon}" aria-hidden="true"></i></section>`;
}

export function notice(message, success = false) {
	return `<div class="admin-notice${success ? ' is-success' : ''}" role="status">${message}</div>`;
}

export function showError(error) {
	view().innerHTML = `<p class="form-error" style="display:block">${escapeHtml(error.message)}</p>`;
}

// Delegación de clics por data-action en una tabla; muestra el error arriba de la tabla.
export function bindActions(container, handlers, messageElement) {
	container.addEventListener('click', async (event) => {
		const button = event.target.closest('[data-action]');
		if (!button || button.disabled || !handlers[button.dataset.action]) return;
		if (messageElement) messageElement.innerHTML = '';
		button.disabled = true;
		try {
			await handlers[button.dataset.action](button.dataset, button);
		} catch (error) {
			if (messageElement) messageElement.innerHTML = notice(escapeHtml(error.message));
			else window.alert(error.message);
		} finally {
			button.disabled = false;
		}
	});
}
