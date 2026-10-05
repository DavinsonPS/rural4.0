import { api } from '../lib/api.js';
import { escapeHtml } from '../lib/html.js';
import { view, header, notice, showError, formatDateTime, options } from './util.js';

const PAGE = 50;
const filters = { accion: '', desde: '', hasta: '', desplazamiento: 0 };

const ACTION_LABELS = {
	'proyecto.editar': 'Editó un proyecto',
	'proyecto.archivar': 'Archivó un proyecto',
	'proyecto.finalizar': 'Finalizó un proyecto',
	'proyecto.reabrir': 'Reabrió un proyecto',
	'proyecto.reasignar': 'Reasignó un proyecto',
	'proyecto.configurar_led': 'Configuró el LED',
	'dispositivo.registrar': 'Registró un dispositivo',
	'dispositivo.vincular': 'Vinculó un dispositivo',
	'dispositivo.desvincular': 'Desvinculó un dispositivo',
	'dispositivo.activar': 'Activó un dispositivo',
	'dispositivo.desactivar': 'Desactivó un dispositivo',
	'foto.ocultar': 'Ocultó una foto',
	'foto.mostrar': 'Mostró una foto',
	'cuestionario.publicar': 'Publicó un cuestionario',
	'cuestionario.editar': 'Ajustó un cuestionario',
	'cuestionario.archivar': 'Archivó un cuestionario',
	'usuario.crear': 'Creó un usuario',
	'usuario.editar': 'Editó un usuario',
	'usuario.cambiar_rol': 'Cambió un rol',
	'usuario.activar': 'Activó un usuario',
	'usuario.desactivar': 'Desactivó un usuario',
	'usuario.reenviar_invitacion': 'Reenvió una invitación',
	'usuario.enviar_restablecimiento': 'Envió restablecimiento de contraseña',
	'institucion.crear': 'Creó una institución',
	'institucion.editar': 'Editó una institución',
	'institucion.activar': 'Activó una institución',
	'institucion.desactivar': 'Desactivó una institución',
	'planta.crear': 'Creó una planta',
	'planta.editar': 'Editó una planta',
	'planta.activar': 'Activó una planta',
	'planta.desactivar': 'Desactivó una planta',
};

function detailText(detail) {
	if (!detail) return '';
	if (typeof detail !== 'object') return String(detail);
	return Object.entries(detail).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join(' · ');
}

async function load() {
	const params = new URLSearchParams({ limite: PAGE, desplazamiento: filters.desplazamiento });
	['accion', 'desde', 'hasta'].forEach((key) => { if (filters[key]) params.set(key, filters[key]); });
	return api(`/api/admin/auditoria?${params}`);
}

function render(data) {
	const body = view().querySelector('#audit-body');
	body.innerHTML = data.registros.map((row) => `<tr>
		<td>${escapeHtml(formatDateTime(row.fecha))}</td>
		<td>${escapeHtml(row.nombres)} ${escapeHtml(row.apellidos)}<small>@${escapeHtml(row.usuario)} · ${escapeHtml(row.rol)}</small></td>
		<td>${escapeHtml(ACTION_LABELS[row.accion] || row.accion)}<small>${escapeHtml(row.accion)}</small></td>
		<td>${escapeHtml(row.entidad)} #${escapeHtml(row.id_entidad ?? '–')}</td>
		<td class="audit-detail">${escapeHtml(detailText(row.detalle))}</td>
	</tr>`).join('') || '<tr><td colspan="5" class="table-empty">No hay registros con esos filtros.</td></tr>';
	view().querySelector('#audit-prev').disabled = filters.desplazamiento === 0;
	view().querySelector('#audit-next').disabled = !data.hay_mas;
	view().querySelector('#audit-page').textContent = `Registros ${data.registros.length ? filters.desplazamiento + 1 : 0}–${filters.desplazamiento + data.registros.length}`;
}

export async function showAudit() {
	view().innerHTML = '<p class="card-help">Cargando auditoría…</p>';
	let data;
	try {
		data = await load();
	} catch (error) {
		showError(error);
		return;
	}
	if (!data.disponible) {
		view().innerHTML = `${header('Operación', 'Auditoría', 'Historial de acciones de gestión.', 'history')}${notice('La auditoría no está activa: falta importar <code>migraciones/002_auditoria.sql</code> en phpMyAdmin.')}`;
		return;
	}
	const grouped = [...new Set(data.acciones.map((action) => action.split('.')[0]))];
	view().innerHTML = `${header('Operación', 'Auditoría', 'Quién hizo qué y cuándo: acciones de docentes y administradores sobre proyectos, dispositivos, cuestionarios, usuarios y catálogos.', 'history')}
		<section class="teacher-panel">
			<div class="admin-toolbar"><div class="admin-filters">
				<div class="form-row"><label class="sr-only" for="a-action">Acción</label><select id="a-action">${options([...grouped.map((group) => [group, `Todo: ${group}`]), ...data.acciones.map((action) => [action, ACTION_LABELS[action] || action])], filters.accion, { empty: 'Todas las acciones' })}</select></div>
				<div class="form-row"><label class="form-label" for="a-from">Desde</label><input type="date" id="a-from" value="${escapeHtml(filters.desde)}"></div>
				<div class="form-row"><label class="form-label" for="a-to">Hasta</label><input type="date" id="a-to" value="${escapeHtml(filters.hasta)}"></div>
			</div></div>
			<div class="student-table-wrap"><table class="student-table admin-table">
				<thead><tr><th>Fecha</th><th>Quién</th><th>Acción</th><th>Sobre</th><th>Detalle</th></tr></thead>
				<tbody id="audit-body"></tbody>
			</table></div>
			<div class="pager"><span class="card-help" id="audit-page"></span><button type="button" class="secondary-btn" id="audit-prev">Anteriores</button><button type="button" class="secondary-btn" id="audit-next">Siguientes</button></div>
		</section>`;
	const refresh = async () => { try { render(await load()); } catch (error) { view().querySelector('#audit-body').innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`; } };
	[['#a-action', 'accion'], ['#a-from', 'desde'], ['#a-to', 'hasta']].forEach(([selector, key]) => {
		view().querySelector(selector).addEventListener('change', (event) => { filters[key] = event.target.value; filters.desplazamiento = 0; refresh(); });
	});
	view().querySelector('#audit-prev').addEventListener('click', () => { filters.desplazamiento = Math.max(0, filters.desplazamiento - PAGE); refresh(); });
	view().querySelector('#audit-next').addEventListener('click', () => { filters.desplazamiento += PAGE; refresh(); });
	render(data);
}
