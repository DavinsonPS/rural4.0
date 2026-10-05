import { api } from '../lib/api.js';
import { escapeHtml } from '../lib/html.js';
import { view, header, notice, showError, bindActions, formatMinutes, options } from './util.js';

const filters = { tipo: '', estado: 'activos', vinculo: '', q: '' };
let devices = [];

function connection(device) {
	if (!device.activo) return '<span class="state-dot is-off">Desactivado</span>';
	if (device.minutos_sin_contacto === null) return '<span class="state-dot is-off">Nunca se ha conectado</span>';
	return device.en_linea
		? `<span class="state-dot is-on">En línea</span><small>${escapeHtml(formatMinutes(device.minutos_sin_contacto))}</small>`
		: `<span class="state-dot is-warn">Sin conexión</span><small>${escapeHtml(formatMinutes(device.minutos_sin_contacto))}</small>`;
}

function renderTable() {
	const search = filters.q.toLowerCase();
	const rows = devices
		.filter((device) => !filters.tipo || device.tipo === filters.tipo)
		.filter((device) => !filters.estado || (filters.estado === 'activos') === device.activo)
		.filter((device) => !filters.vinculo || (filters.vinculo === 'vinculados') === Boolean(device.id_proyecto))
		.filter((device) => !search || `${device.codigo_interno} ${device.mac_address} ${device.serial} ${device.proyecto} ${device.estudiante}`.toLowerCase().includes(search));
	view().querySelector('#devices-count').textContent = `${rows.length} de ${devices.length} dispositivo(s)`;
	view().querySelector('#devices-body').innerHTML = rows.map((device) => `<tr class="${device.activo ? '' : 'is-inactive'}">
		<td>${escapeHtml(device.codigo_interno)}<small>${escapeHtml(device.modelo || 'ESP32')} · ${escapeHtml(device.mac_address || device.serial || 'sin identificador')}</small></td>
		<td>${device.tipo === 'camara' ? '<i class="ti ti-camera" aria-hidden="true"></i> Cámara' : '<i class="ti ti-cpu" aria-hidden="true"></i> Sensores'}<small>Firmware ${escapeHtml(device.version_firmware || 'desconocido')}</small></td>
		<td>${connection(device)}</td>
		<td>${device.tipo === 'camara' ? `${device.fotos_24h} fotos` : `${device.lecturas_24h} lecturas`}</td>
		<td>${device.id_proyecto ? `${escapeHtml(device.proyecto)}<small>${escapeHtml(device.estudiante || '')}${device.proyecto_fecha_fin ? ' · finalizado' : ''}</small>` : device.pendiente_vinculacion ? '<small>Esperando vinculación</small>' : '<small>Libre</small>'}</td>
		<td><div class="admin-actions">
			${device.id_proyecto ? `<button type="button" class="is-danger" data-action="release" data-id="${device.id}">Desvincular</button>` : ''}
			<button type="button" class="${device.activo ? 'is-danger' : ''}" data-action="toggle" data-id="${device.id}"${device.activo && device.id_proyecto ? ' disabled title="Desvincúlalo primero"' : ''}>${device.activo ? 'Desactivar' : 'Activar'}</button>
		</div></td>
	</tr>`).join('') || '<tr><td colspan="6" class="table-empty">No hay dispositivos con esos filtros.</td></tr>';
}

async function reload() {
	devices = await api('/api/admin/dispositivos');
	renderTable();
}

export async function showDevices() {
	view().innerHTML = '<p class="card-help">Cargando dispositivos…</p>';
	try {
		devices = await api('/api/admin/dispositivos');
	} catch (error) {
		showError(error);
		return;
	}
	view().innerHTML = `${header('Operación', 'Dispositivos', 'Todos los ESP32 y cámaras provisionados: conexión, firmware y proyecto al que están vinculados.', 'cpu')}
		<section class="teacher-panel">
			<div class="admin-toolbar"><div class="admin-filters">
				<div class="form-row"><label class="sr-only" for="d-type">Tipo</label><select id="d-type">${options([['sensor', 'Sensores'], ['camara', 'Cámaras']], filters.tipo, { empty: 'Todos los tipos' })}</select></div>
				<div class="form-row"><label class="sr-only" for="d-state">Estado</label><select id="d-state">${options([['activos', 'Activos'], ['inactivos', 'Desactivados']], filters.estado, { empty: 'Todos' })}</select></div>
				<div class="form-row"><label class="sr-only" for="d-link">Vínculo</label><select id="d-link">${options([['vinculados', 'Vinculados'], ['libres', 'Libres']], filters.vinculo, { empty: 'Con y sin proyecto' })}</select></div>
				<div class="form-row"><label class="sr-only" for="d-q">Buscar</label><input type="text" id="d-q" placeholder="Código, MAC, proyecto o estudiante" value="${escapeHtml(filters.q)}"></div>
			</div></div>
			<div id="devices-message"></div>
			<p class="card-help" id="devices-count"></p>
			<p class="card-help">Desactivar un dispositivo invalida su API key: dejará de poder enviar datos o actualizar firmware hasta que se reactive.</p>
			<div class="student-table-wrap"><table class="student-table admin-table">
				<thead><tr><th>Dispositivo</th><th>Tipo</th><th>Conexión</th><th>Últimas 24 h</th><th>Proyecto</th><th><span class="sr-only">Acciones</span></th></tr></thead>
				<tbody id="devices-body"></tbody>
			</table></div>
		</section>`;
	[['#d-type', 'tipo'], ['#d-state', 'estado'], ['#d-link', 'vinculo']].forEach(([selector, key]) => {
		view().querySelector(selector).addEventListener('change', (event) => { filters[key] = event.target.value; renderTable(); });
	});
	view().querySelector('#d-q').addEventListener('input', (event) => { filters.q = event.target.value.trim(); renderTable(); });
	const message = view().querySelector('#devices-message');
	bindActions(view().querySelector('#devices-body'), {
		release: async ({ id }) => {
			const device = devices.find((item) => item.id === Number(id));
			if (!window.confirm(`¿Desvincular ${device.codigo_interno} del proyecto "${device.proyecto}"? Dejará de guardar datos en ese proyecto.`)) return;
			await api(`/api/admin/dispositivos/${id}/desvincular`, { method: 'POST' });
			await reload();
			message.innerHTML = notice(`${escapeHtml(device.codigo_interno)} quedó libre. Para usarlo en otro proyecto, reinícialo para que se vuelva a provisionar y aparezca en "Pendientes".`, true);
		},
		toggle: async ({ id }) => {
			const device = devices.find((item) => item.id === Number(id));
			if (device.activo && !window.confirm(`¿Desactivar ${device.codigo_interno}? Su API key dejará de funcionar.`)) return;
			await api(`/api/admin/dispositivos/${id}/estado`, { method: 'PATCH', body: { activo: !device.activo } });
			await reload();
		},
	}, message);
	renderTable();
}
