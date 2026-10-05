import { api } from '../lib/api.js';
import { escapeHtml } from '../lib/html.js';
import { openModal } from '../lib/modal.js';
import { view, header, field, input, notice, showError, bindActions, stateDot } from './util.js';

// Pantalla genérica de catálogo: lista, crear, editar, activar/desactivar.
async function showCatalog(config) {
	view().innerHTML = '<p class="card-help">Cargando…</p>';
	let items;
	try {
		items = await api(config.endpoint);
	} catch (error) {
		showError(error);
		return;
	}
	view().innerHTML = `${header(config.eyebrow, config.title, config.description, config.icon)}
		<section class="teacher-panel">
			<div class="admin-toolbar"><p class="card-help">${items.length} registro(s). ${escapeHtml(config.deactivateNote)}</p><button type="button" class="save-btn" id="new-item"><i class="ti ti-plus" aria-hidden="true"></i>${escapeHtml(config.newLabel)}</button></div>
			<div id="catalog-message"></div>
			<div class="student-table-wrap"><table class="student-table admin-table">
				<thead><tr>${config.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}<th><span class="sr-only">Acciones</span></th></tr></thead>
				<tbody id="catalog-body">${items.map((item) => `<tr class="${item.activo ? '' : 'is-inactive'}">${config.row(item)}<td><div class="admin-actions"><button type="button" data-action="edit" data-id="${item.id}">Editar</button><button type="button" class="${item.activo ? 'is-danger' : ''}" data-action="toggle" data-id="${item.id}">${item.activo ? 'Desactivar' : 'Activar'}</button></div></td></tr>`).join('') || `<tr><td colspan="${config.columns.length + 1}" class="table-empty">Sin registros.</td></tr>`}</tbody>
			</table></div>
		</section>`;
	const message = view().querySelector('#catalog-message');
	const open = (item = null) => openModal({
		eyebrow: config.title,
		title: item ? `Editar: ${item[config.nameKey]}` : config.newLabel,
		body: config.form(item),
		onSubmit: async (data) => {
			const body = Object.fromEntries(data.entries());
			await api(item ? `${config.endpoint}/${item.id}` : config.endpoint, { method: item ? 'PUT' : 'POST', body });
			await showCatalog(config);
			view().querySelector('#catalog-message').innerHTML = notice(item ? 'Cambios guardados.' : 'Registro creado.', true);
		},
	});
	view().querySelector('#new-item').addEventListener('click', () => open());
	bindActions(view().querySelector('#catalog-body'), {
		edit: ({ id }) => open(items.find((item) => item.id === Number(id))),
		toggle: async ({ id }) => {
			const item = items.find((entry) => entry.id === Number(id));
			if (item.activo && !window.confirm(`¿Desactivar "${item[config.nameKey]}"? ${config.deactivateNote}`)) return;
			await api(`${config.endpoint}/${id}/estado`, { method: 'PATCH', body: { activo: !item.activo } });
			await showCatalog(config);
		},
	}, message);
}

export function showInstitutions() {
	return showCatalog({
		endpoint: '/api/admin/instituciones',
		eyebrow: 'Catálogo', title: 'Instituciones', icon: 'building', nameKey: 'nombre',
		description: 'Las instituciones activas aparecen en el registro de estudiantes y al crear docentes.',
		newLabel: 'Nueva institución',
		deactivateNote: 'Una institución desactivada deja de aparecer en el registro; sus usuarios conservan su cuenta.',
		columns: ['Institución', 'Ubicación', 'Contacto', 'Usuarios', 'Estado'],
		row: (item) => `<td>${escapeHtml(item.nombre)}<small>${item.codigo_dane ? `DANE ${escapeHtml(item.codigo_dane)}` : 'Sin código DANE'}</small></td>
			<td>${escapeHtml([item.municipio, item.departamento].filter(Boolean).join(', ') || '–')}<small>${escapeHtml(item.direccion || '')}</small></td>
			<td>${escapeHtml(item.correo || '–')}<small>${escapeHtml(item.telefono || '')}</small></td>
			<td>${item.usuarios}</td><td>${stateDot(item.activo)}</td>`,
		form: (item) => `${field('i-name', 'Nombre', input('i-name', 'nombre', item?.nombre, 'maxlength="150" required'))}
			<div class="two-fields">
				${field('i-dane', 'Código DANE (opcional)', input('i-dane', 'codigo_dane', item?.codigo_dane, 'maxlength="20"'))}
				${field('i-address', 'Dirección', input('i-address', 'direccion', item?.direccion, 'maxlength="255"'))}
			</div>
			<div class="two-fields">
				${field('i-city', 'Municipio', input('i-city', 'municipio', item?.municipio, 'maxlength="100"'))}
				${field('i-state', 'Departamento', input('i-state', 'departamento', item?.departamento, 'maxlength="100"'))}
			</div>
			<div class="two-fields">
				${field('i-email', 'Correo', `<input type="email" id="i-email" name="correo" maxlength="150" value="${escapeHtml(item?.correo || '')}">`)}
				${field('i-phone', 'Teléfono', `<input type="tel" id="i-phone" name="telefono" maxlength="30" value="${escapeHtml(item?.telefono || '')}">`)}
			</div>`,
	});
}

export function showPlants() {
	return showCatalog({
		endpoint: '/api/admin/plantas',
		eyebrow: 'Catálogo', title: 'Plantas', icon: 'plant', nameKey: 'nombre_comun',
		description: 'Las plantas activas son las que los estudiantes pueden elegir al crear un proyecto.',
		newLabel: 'Nueva planta',
		deactivateNote: 'Una planta desactivada ya no se puede elegir en proyectos nuevos; los proyectos existentes no cambian.',
		columns: ['Planta', 'Tipo de cultivo', 'Descripción', 'Proyectos', 'Estado'],
		row: (item) => `<td>${escapeHtml(item.nombre_comun)}<small><em>${escapeHtml(item.nombre_cientifico || '')}</em></small></td>
			<td>${escapeHtml(item.tipo_cultivo || '–')}</td>
			<td><small>${escapeHtml((item.descripcion || '').slice(0, 140))}${(item.descripcion || '').length > 140 ? '…' : ''}</small></td>
			<td>${item.proyectos}</td><td>${stateDot(item.activo)}</td>`,
		form: (item) => `<div class="two-fields">
				${field('p-name', 'Nombre común', input('p-name', 'nombre_comun', item?.nombre_comun, 'maxlength="100" required'))}
				${field('p-sci', 'Nombre científico', input('p-sci', 'nombre_cientifico', item?.nombre_cientifico, 'maxlength="150"'))}
			</div>
			${field('p-type', 'Tipo de cultivo', input('p-type', 'tipo_cultivo', item?.tipo_cultivo, 'maxlength="100" placeholder="Ej: Hortaliza de hoja"'))}
			${field('p-desc', 'Descripción', `<textarea id="p-desc" name="descripcion" rows="4" maxlength="2000">${escapeHtml(item?.descripcion || '')}</textarea>`)}`,
	});
}
