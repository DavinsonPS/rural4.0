import { api } from '../lib/api.js';
import { escapeHtml } from '../lib/html.js';
import { fullName } from './formato.js';

const brightnessByLevel = { suave: 64, media: 128, intensa: 192, maxima: 255 };
const ledLevels = [['suave', 'Suave · 25%'], ['media', 'Media · 50%'], ['intensa', 'Intensa · 75%'], ['maxima', 'Máxima · 100%']];
const ledColors = [['rojo', 'Rojo'], ['verde', 'Verde'], ['azul', 'Azul'], ['blanco', 'Blanco'], ['amarillo', 'Amarillo'], ['morado', 'Morado']];
const soilTypes = [['franca', 'Tierra franca'], ['arenosa', 'Tierra arenosa'], ['arcillosa', 'Tierra arcillosa'], ['compost', 'Tierra con compost']];

const modal = document.getElementById('teacher-modal');
const modalTitle = document.getElementById('teacher-modal-title');
const modalForm = document.getElementById('teacher-modal-form');
let submitHandler = null;

function closeModal() {
	modal.hidden = true;
	modalForm.innerHTML = '';
	submitHandler = null;
}

document.getElementById('teacher-modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeModal(); });
modalForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	if (!submitHandler) return;
	const error = modalForm.querySelector('.form-error');
	const button = modalForm.querySelector('[type="submit"]');
	error.style.display = 'none';
	button.disabled = true;
	try {
		await submitHandler(new FormData(modalForm));
		closeModal();
	} catch (failure) {
		error.textContent = failure.message;
		error.style.display = 'block';
		button.disabled = false;
	}
});

export function openModal(title, fieldsHtml, submitLabel, onSubmit, eyebrow = 'Gestión del proyecto') {
	modalTitle.textContent = title;
	modal.querySelector('.eyebrow').textContent = eyebrow;
	modalForm.innerHTML = `${fieldsHtml}<div class="form-error" role="alert"></div><div class="modal-actions-row"><button class="secondary-btn" type="button" data-close>Cancelar</button><button class="save-btn" type="submit">${escapeHtml(submitLabel)}</button></div>`;
	modalForm.querySelector('[data-close]').addEventListener('click', closeModal);
	submitHandler = onSubmit;
	modal.hidden = false;
	modalForm.querySelector('input, select, textarea, button')?.focus();
}

function options(list, selected) {
	return list.map(([value, label]) => `<option value="${escapeHtml(value)}"${String(value) === String(selected ?? '') ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

function field(id, label, control) {
	return `<div class="form-row"><label class="form-label" for="${id}">${escapeHtml(label)}</label>${control}</div>`;
}

function ledFields(project) {
	return `<div class="three-fields">
		${field('m-led-level', 'Luz de exposición', `<select id="m-led-level" name="configuracion_led">${options(ledLevels, project.configuracion_led || 'maxima')}</select>`)}
		${field('m-led-color', 'Color de los LED', `<select id="m-led-color" name="color_led">${options(ledColors, project.color_led || 'rojo')}</select>`)}
		${field('m-soil', 'Tipo de tierra', `<select id="m-soil" name="tipo_tierra">${options(soilTypes, project.tipo_tierra || 'franca')}</select>`)}
	</div>`;
}

function ledPayload(form) {
	const level = form.get('configuracion_led');
	return { configuracion_led: level, color_led: form.get('color_led'), brillo_led: brightnessByLevel[level], tipo_tierra: form.get('tipo_tierra') };
}

async function editProject(project, reload) {
	const plants = await api('/api/proyectos/plantas');
	const hasDevices = Boolean(project.id_dispositivo || project.id_dispositivo_camara);
	openModal('Editar proyecto', `
		${field('m-name', 'Nombre del proyecto', `<input type="text" id="m-name" name="nombre" maxlength="150" required value="${escapeHtml(project.nombre)}">`)}
		${field('m-plant', 'Planta', `<select id="m-plant" name="id_planta"${hasDevices ? ' disabled' : ''}>${options(plants.map((plant) => [plant.id, plant.nombre_comun]), project.id_planta)}</select>`)}
		${hasDevices ? '<p class="card-help">La planta no se puede cambiar mientras haya dispositivos vinculados.</p>' : ''}
		${field('m-description', 'Descripción', `<textarea id="m-description" name="descripcion" rows="3">${escapeHtml(project.descripcion || '')}</textarea>`)}
	`, 'Guardar cambios', async (form) => {
		await api(`/api/proyectos/${project.id}`, {
			method: 'PUT',
			body: { nombre: form.get('nombre'), descripcion: form.get('descripcion'), id_planta: Number(form.get('id_planta') || project.id_planta), id_docente: project.id_docente },
		});
		await reload('Proyecto actualizado.');
	});
}

function configureLed(project, reload) {
	openModal('Configurar luz y tierra', ledFields(project), 'Guardar configuración', async (form) => {
		await api(`/api/dispositivos/proyectos/${project.id}/configuracion`, { method: 'POST', body: ledPayload(form) });
		await reload('Configuración del LED guardada. El ESP32 la tomará en su próxima consulta.');
	});
}

async function linkDevice(project, reload) {
	const pending = await api('/api/dispositivos/pendientes');
	const freeTypes = [!project.id_dispositivo && ['sensor', 'ESP32 de sensores'], !project.id_dispositivo_camara && ['camara', 'ESP32-CAMERA']].filter(Boolean);
	const deviceOptions = pending.length
		? pending.map((device) => `<option value="${Number(device.id)}" data-code="${escapeHtml(device.codigo_interno)}" data-link="${escapeHtml(device.codigo_vinculacion || '')}" data-model="${escapeHtml(device.modelo || '')}">${escapeHtml(device.codigo_interno)} · ${escapeHtml(device.modelo || 'ESP32')} · ${escapeHtml(device.mac_address || device.serial || '')}</option>`).join('')
		: '<option value="">No hay dispositivos provisionados en las últimas 24 h</option>';
	openModal('Vincular dispositivo', `
		${field('m-kind', 'Tipo de dispositivo', `<select id="m-kind" name="tipo_dispositivo">${options(freeTypes, freeTypes[0]?.[0])}</select>`)}
		${field('m-device', 'Dispositivo provisionado', `<select id="m-device" name="dispositivo" required>${deviceOptions}</select>`)}
		<div id="m-led-block">${ledFields(project)}</div>
	`, 'Vincular', async (form) => {
		const option = modalForm.querySelector('#m-device').selectedOptions[0];
		if (!option?.dataset.code) throw new Error('Selecciona un dispositivo provisionado.');
		const kind = form.get('tipo_dispositivo');
		await api(`/api/dispositivos/proyectos/${project.id}/vincular`, {
			method: 'POST',
			body: { codigo_interno: option.dataset.code, codigo_vinculacion: option.dataset.link, tipo_dispositivo: kind, ...(kind === 'sensor' ? ledPayload(form) : {}) },
		});
		await reload(kind === 'camara' ? 'ESP32-CAMERA vinculada.' : 'ESP32 de sensores vinculado.');
	});
	const kindSelect = modalForm.querySelector('#m-kind');
	const syncKind = () => { modalForm.querySelector('#m-led-block').hidden = kindSelect.value !== 'sensor'; };
	kindSelect.addEventListener('change', syncKind);
	syncKind();
}

async function reassign(project, reload) {
	const teachers = (await api(`/api/docente/proyectos/${project.id}/docentes`)).filter((teacher) => Number(teacher.id) !== Number(project.id_docente));
	if (!teachers.length) throw new Error('No hay otros docentes activos en la institución.');
	openModal('Reasignar a otro docente', `
		${field('m-teacher', 'Nuevo docente', `<select id="m-teacher" name="id_docente">${options(teachers.map((teacher) => [teacher.id, fullName(teacher)]))}</select>`)}
		<p class="card-help">Al reasignarlo dejarás de ver este proyecto en tu panel.</p>
	`, 'Reasignar', async (form) => {
		await api(`/api/docente/proyectos/${project.id}/docente`, { method: 'PUT', body: { id_docente: Number(form.get('id_docente')) } });
		window.location.hash = '#panel';
	});
}

async function confirmAction(message, action) {
	if (!window.confirm(message)) return;
	await action();
}

// Botones de gestión según el estado del proyecto. El servidor vuelve a validar cada acción.
export function renderManagement(container, messageElement, project, reload) {
	const finalized = Boolean(project.fecha_fin);
	const hasSensor = Boolean(project.id_dispositivo);
	const hasCamera = Boolean(project.id_dispositivo_camara);
	const actions = [
		{ id: 'edit', icon: 'pencil', label: 'Editar datos', run: () => editProject(project, reload) },
		hasSensor && { id: 'led', icon: 'bulb', label: 'Configurar LED', run: () => configureLed(project, reload) },
		(!hasSensor || !hasCamera) && { id: 'link', icon: 'link', label: 'Vincular dispositivo', run: () => linkDevice(project, reload) },
		hasSensor && { id: 'unlink-sensor', icon: 'plug-off', label: 'Desvincular sensores', run: () => confirmAction('¿Desvincular el ESP32 de sensores? Dejará de guardar lecturas en este proyecto.', async () => {
			await api(`/api/dispositivos/proyectos/${project.id}`, { method: 'DELETE' });
			await reload('ESP32 de sensores desvinculado.');
		}) },
		hasCamera && { id: 'unlink-camera', icon: 'camera-off', label: 'Desvincular cámara', run: () => confirmAction('¿Desvincular la ESP32-CAMERA de este proyecto?', async () => {
			await api(`/api/dispositivos/proyectos/${project.id}?tipo_dispositivo=camara`, { method: 'DELETE' });
			await reload('ESP32-CAMERA desvinculada.');
		}) },
		finalized
			? { id: 'reopen', icon: 'lock-open', label: 'Reabrir proyecto', run: () => confirmAction('¿Reabrir el proyecto? El estudiante podrá volver a registrar bitácoras.', async () => {
				await api(`/api/docente/proyectos/${project.id}/reabrir`, { method: 'POST' });
				await reload('Proyecto reabierto.');
			}) }
			: { id: 'finalize', icon: 'flag-check', label: 'Finalizar proyecto', run: () => confirmAction('¿Finalizar el proyecto? El estudiante solo podrá consultarlo. Los dispositivos seguirán vinculados.', async () => {
				await api(`/api/docente/proyectos/${project.id}/finalizar`, { method: 'POST' });
				await reload('Proyecto finalizado.');
			}) },
		{ id: 'reassign', icon: 'user-share', label: 'Reasignar docente', run: () => reassign(project, reload) },
		{ id: 'archive', icon: 'archive', label: 'Archivar', danger: true, disabled: hasSensor || hasCamera, title: 'Desvincula los dispositivos antes de archivar', run: () => confirmAction(`¿Archivar el proyecto "${project.nombre}"? Dejará de aparecer para el estudiante y en tu panel.`, async () => {
			await api(`/api/proyectos/${project.id}`, { method: 'DELETE' });
			window.location.hash = '#panel';
		}) },
	].filter(Boolean);

	container.innerHTML = actions.map((action) => `<button type="button" class="secondary-btn${action.danger ? ' danger-btn' : ''}" data-action="${action.id}"${action.disabled ? ` disabled title="${escapeHtml(action.title)}"` : ''}><i class="ti ti-${action.icon}" aria-hidden="true"></i>${escapeHtml(action.label)}</button>`).join('');
	container.onclick = async (event) => {
		const button = event.target.closest('[data-action]');
		const action = actions.find((item) => item.id === button?.dataset.action);
		if (!action || button.disabled) return;
		messageElement.textContent = '';
		try {
			await action.run();
		} catch (error) {
			messageElement.textContent = error.message;
		}
	};
}
