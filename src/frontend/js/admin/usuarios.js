import { api } from '../lib/api.js';
import { escapeHtml } from '../lib/html.js';
import { openModal } from '../lib/modal.js';
import { view, header, field, input, options, notice, showError, bindActions, stateDot, formatDateTime } from './util.js';

const ROLE_NAMES = { ESTUDIANTE: 'Estudiante', DOCENTE: 'Docente', ADMINISTRADOR: 'Administrador' };
const filters = { rol: '', estado: 'activos', institucion: '', q: '' };
let catalogs = null;
let users = [];

function userForm(user = null, { creating }) {
	const staffRoles = [['DOCENTE', 'Docente'], ['ADMINISTRADOR', 'Administrador']];
	return `${creating ? field('u-role', 'Rol', `<select id="u-role" name="rol">${options(staffRoles, 'DOCENTE')}</select>`) : ''}
		<div class="two-fields">
			${field('u-names', 'Nombres', input('u-names', 'nombres', user?.nombres, 'maxlength="100" required'))}
			${field('u-surnames', 'Apellidos', input('u-surnames', 'apellidos', user?.apellidos, 'maxlength="100" required'))}
		</div>
		<div class="two-fields">
			${field('u-doc-type', 'Tipo de documento', `<select id="u-doc-type" name="id_tipo_documento" required>${options(catalogs.tipos_documento.map((type) => [type.id, `${type.codigo} · ${type.nombre}`]), user?.id_tipo_documento || catalogs.tipos_documento[0]?.id)}</select>`)}
			${field('u-doc', 'Número de documento', input('u-doc', 'numero_documento', user?.numero_documento, 'maxlength="30" required'))}
		</div>
		<div class="two-fields">
			${field('u-email', 'Correo', `<input type="email" id="u-email" name="correo" maxlength="150" required value="${escapeHtml(user?.correo || '')}">`)}
			${field('u-phone', 'Teléfono (opcional)', `<input type="tel" id="u-phone" name="telefono" maxlength="30" value="${escapeHtml(user?.telefono || '')}">`)}
		</div>
		<div class="two-fields">
			${field('u-user', 'Usuario para iniciar sesión', input('u-user', 'usuario', user?.usuario, 'maxlength="80" required pattern="[A-Za-z0-9._-]{3,80}"'))}
			${field('u-inst', 'Institución', `<select id="u-inst" name="id_institucion" required>${options(catalogs.instituciones.map((institution) => [institution.id, institution.nombre]), user?.id_institucion)}</select>`)}
		</div>
		${creating ? '<p class="card-help">La persona recibirá un correo de invitación para crear su propia contraseña (el enlace dura 72 horas). Tú nunca conoces su contraseña.</p>' : ''}`;
}

function formBody(data) {
	return Object.fromEntries(['rol', 'nombres', 'apellidos', 'id_tipo_documento', 'numero_documento', 'correo', 'telefono', 'usuario', 'id_institucion'].map((name) => [name, data.get(name)]));
}

// Resultado del envío de acceso: si el correo no salió, se muestra el enlace para compartirlo.
function accessResultHtml(result, user) {
	if (result.enviada) return notice(`Se envió ${result.tipo === 'restablecimiento' ? 'un enlace para restablecer la contraseña' : 'la invitación'} a <strong>${escapeHtml(user.correo)}</strong> (vence en ${result.horas} h).`, true);
	return `${notice(`No fue posible enviar el correo a <strong>${escapeHtml(user.correo)}</strong>. Comparte este enlace de invitación por otro medio (vence en ${result.horas} h, un solo uso):`)}
		<div class="invitation-link"><input type="text" readonly value="${escapeHtml(result.enlace)}" aria-label="Enlace de invitación"><button type="button" class="secondary-btn" data-copy>Copiar</button></div>`;
}

function showAccessResult(result, user) {
	const form = openModal({ eyebrow: 'Acceso a la cuenta', title: `${user.nombres} ${user.apellidos}`, body: accessResultHtml(result, user) });
	form.querySelector('[data-copy]')?.addEventListener('click', async (event) => {
		const linkInput = form.querySelector('.invitation-link input');
		linkInput.select();
		try { await navigator.clipboard.writeText(linkInput.value); event.target.textContent = 'Copiado'; } catch { document.execCommand('copy'); }
	});
}

function renderTable(currentUser) {
	const body = view().querySelector('#users-body');
	const count = view().querySelector('#users-count');
	count.textContent = `${users.length} usuario${users.length === 1 ? '' : 's'}${users.length === 500 ? ' (máximo mostrado; usa los filtros)' : ''}`;
	body.innerHTML = users.map((user) => {
		const self = Number(user.id) === Number(currentUser.id);
		const projects = user.rol === 'DOCENTE' ? `${user.proyectos_como_docente} proyecto(s) a cargo` : user.rol === 'ESTUDIANTE' ? `${user.proyectos_como_estudiante} proyecto(s)` : '';
		return `<tr class="${user.activo ? '' : 'is-inactive'}">
			<td>${escapeHtml(user.nombres)} ${escapeHtml(user.apellidos)}${self ? ' <span class="chip">Tú</span>' : ''}<small>@${escapeHtml(user.usuario)} · ${escapeHtml(user.tipo_documento || '')} ${escapeHtml(user.numero_documento)}</small></td>
			<td><span class="role-badge role-${escapeHtml(user.rol)}">${escapeHtml(ROLE_NAMES[user.rol] || user.rol)}</span><small>${escapeHtml(projects)}</small></td>
			<td>${escapeHtml(user.institucion || '–')}<small>${escapeHtml(user.correo || 'Sin correo')}</small></td>
			<td>${stateDot(user.activo)}<small>${user.invitacion_pendiente ? 'Nunca ha entrado' : `Último acceso: ${formatDateTime(user.ultimo_acceso)}`}</small></td>
			<td><div class="admin-actions">
				<button type="button" data-action="edit" data-id="${user.id}">Editar</button>
				<button type="button" data-action="role" data-id="${user.id}"${self ? ' disabled title="No puedes cambiar tu propio rol"' : ''}>Rol</button>
				${user.activo ? `<button type="button" data-action="access" data-id="${user.id}">${user.invitacion_pendiente ? 'Reenviar invitación' : 'Enviar restablecimiento'}</button>` : ''}
				<button type="button" class="${user.activo ? 'is-danger' : ''}" data-action="toggle" data-id="${user.id}"${self ? ' disabled title="No puedes desactivar tu propia cuenta"' : ''}>${user.activo ? 'Desactivar' : 'Activar'}</button>
			</div></td>
		</tr>`;
	}).join('') || '<tr><td colspan="5" class="table-empty">No hay usuarios con esos filtros.</td></tr>';
}

async function reload(currentUser) {
	const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
	users = await api(`/api/admin/usuarios?${params}`);
	renderTable(currentUser);
}

export async function showUsers(currentUser) {
	view().innerHTML = '<p class="card-help">Cargando usuarios…</p>';
	try {
		catalogs = await api('/api/admin/usuarios/catalogos');
	} catch (error) {
		showError(error);
		return;
	}
	view().innerHTML = `${header('Cuentas', 'Usuarios', 'Crea docentes y administradores, cambia roles y controla quién tiene acceso. Los estudiantes se registran solos desde la página de inicio.', 'users')}
		<section class="teacher-panel">
			<div class="admin-toolbar">
				<div class="admin-filters">
					<div class="form-row"><label class="sr-only" for="f-role">Rol</label><select id="f-role">${options(Object.entries(ROLE_NAMES), filters.rol, { empty: 'Todos los roles' })}</select></div>
					<div class="form-row"><label class="sr-only" for="f-state">Estado</label><select id="f-state">${options([['activos', 'Activos'], ['inactivos', 'Inactivos'], ['todos', 'Todos']], filters.estado)}</select></div>
					<div class="form-row"><label class="sr-only" for="f-inst">Institución</label><select id="f-inst">${options(catalogs.instituciones.map((institution) => [institution.id, institution.nombre]), filters.institucion, { empty: 'Todas las instituciones' })}</select></div>
					<div class="form-row"><label class="sr-only" for="f-q">Buscar</label><input type="text" id="f-q" placeholder="Nombre, usuario, correo o documento" value="${escapeHtml(filters.q)}"></div>
				</div>
				<button type="button" class="save-btn" id="new-user"><i class="ti ti-user-plus" aria-hidden="true"></i>Nuevo docente o administrador</button>
			</div>
			<div id="users-message"></div>
			<p class="card-help" id="users-count"></p>
			<div class="student-table-wrap"><table class="student-table admin-table">
				<thead><tr><th>Persona</th><th>Rol</th><th>Institución y correo</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead>
				<tbody id="users-body"><tr><td colspan="5" class="table-empty">Cargando…</td></tr></tbody>
			</table></div>
		</section>`;

	const message = view().querySelector('#users-message');
	const bindFilter = (id, key, eventName = 'change') => view().querySelector(id).addEventListener(eventName, (event) => {
		filters[key] = event.target.value === 'todos' ? '' : event.target.value;
		if (key === 'estado') filters.estado = event.target.value === 'todos' ? '' : event.target.value;
		reload(currentUser).catch((error) => { message.innerHTML = notice(escapeHtml(error.message)); });
	});
	bindFilter('#f-role', 'rol');
	bindFilter('#f-state', 'estado');
	bindFilter('#f-inst', 'institucion');
	let searchTimer;
	view().querySelector('#f-q').addEventListener('input', (event) => {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => { filters.q = event.target.value.trim(); reload(currentUser).catch(() => {}); }, 300);
	});

	view().querySelector('#new-user').addEventListener('click', () => {
		if (!catalogs.instituciones.length) {
			message.innerHTML = notice('Primero crea una institución en <a href="#instituciones">Instituciones</a>.');
			return;
		}
		openModal({
			eyebrow: 'Nueva cuenta',
			title: 'Crear docente o administrador',
			body: userForm(null, { creating: true }),
			submitLabel: 'Crear y enviar invitación',
			onSubmit: async (data) => {
				const body = formBody(data);
				const result = await api('/api/admin/usuarios', { method: 'POST', body });
				await reload(currentUser);
				showAccessResult({ ...result.invitacion, tipo: 'invitacion' }, body);
				return true;
			},
		});
	});

	bindActions(view().querySelector('#users-body'), {
		edit: ({ id }) => {
			const user = users.find((item) => item.id === Number(id));
			openModal({
				eyebrow: 'Editar cuenta', title: `${user.nombres} ${user.apellidos}`, body: userForm(user, { creating: false }),
				onSubmit: async (data) => {
					await api(`/api/admin/usuarios/${id}`, { method: 'PUT', body: formBody(data) });
					await reload(currentUser);
					message.innerHTML = notice('Usuario actualizado.', true);
				},
			});
		},
		role: ({ id }) => {
			const user = users.find((item) => item.id === Number(id));
			openModal({
				eyebrow: 'Cambiar rol', title: `${user.nombres} ${user.apellidos}`,
				body: `${field('r-role', 'Nuevo rol', `<select id="r-role" name="rol">${options(Object.entries(ROLE_NAMES), user.rol)}</select>`)}
					<p class="card-help">No se puede cambiar el rol de un docente con proyectos a cargo ni de un estudiante con proyectos activos: primero hay que reasignarlos. El cambio aplica de inmediato.</p>`,
				submitLabel: 'Cambiar rol',
				onSubmit: async (data) => {
					await api(`/api/admin/usuarios/${id}/rol`, { method: 'PATCH', body: { rol: data.get('rol') } });
					await reload(currentUser);
					message.innerHTML = notice('Rol actualizado.', true);
				},
			});
		},
		toggle: async ({ id }) => {
			const user = users.find((item) => item.id === Number(id));
			if (user.activo && !window.confirm(`¿Desactivar la cuenta de ${user.nombres} ${user.apellidos}? Perderá el acceso de inmediato.`)) return;
			const result = await api(`/api/admin/usuarios/${id}/estado`, { method: 'PATCH', body: { activo: !user.activo } });
			await reload(currentUser);
			message.innerHTML = notice(escapeHtml(result.aviso || (user.activo ? 'Cuenta desactivada.' : 'Cuenta activada.')), !result.aviso);
		},
		access: async ({ id }) => {
			const user = users.find((item) => item.id === Number(id));
			const result = await api(`/api/admin/usuarios/${id}/acceso`, { method: 'POST' });
			showAccessResult(result, user);
		},
	}, message);

	try {
		await reload(currentUser);
	} catch (error) {
		message.innerHTML = notice(escapeHtml(error.message));
	}
}
