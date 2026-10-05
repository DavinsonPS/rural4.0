import { api } from '../lib/api.js';
import { escapeHtml } from '../lib/html.js';
import { view, header, showError, formatDateTime } from './util.js';

function card(value, label, note = '', warning = false) {
	return `<article class="admin-card${warning ? ' is-warning' : ''}"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span>${note ? `<small>${note}</small>` : ''}</article>`;
}

export async function showOverview() {
	view().innerHTML = '<p class="card-help">Cargando resumen…</p>';
	let data;
	try {
		data = await api('/api/admin/resumen');
	} catch (error) {
		showError(error);
		return;
	}
	const firmwareNote = (firmware) => (firmware.disponible
		? `${Math.round(firmware.tamano_bytes / 1024)} KB · publicada ${escapeHtml(formatDateTime(firmware.fecha))}`
		: escapeHtml(firmware.error || 'No hay firmware.bin publicado'));
	const firmwareCard = (firmware, label) => card(firmware.disponible ? firmware.version : 'Sin OTA', label, firmwareNote(firmware), false);
	view().innerHTML = `${header('Vista general', 'Estado de Rural 4.0', 'Usuarios, proyectos y dispositivos de toda la plataforma.', 'shield-check')}
		<h2 class="admin-group-title">Usuarios</h2>
		<div class="admin-grid">
			${card(data.estudiantes, 'Estudiantes activos')}
			${card(data.docentes, 'Docentes activos', '<a href="#usuarios">Crear o gestionar docentes</a>')}
			${card(data.administradores, 'Administradores activos', '', data.administradores < 2)}
			${card(data.usuarios_activos_7d, 'Entraron en los últimos 7 días')}
			${card(data.usuarios_inactivos, 'Cuentas desactivadas')}
			${card(data.registros_pendientes, 'Registros esperando verificación de correo')}
		</div>
		<h2 class="admin-group-title">Proyectos y aprendizaje</h2>
		<div class="admin-grid">
			${card(data.proyectos_en_curso, 'Proyectos en curso')}
			${card(data.proyectos_finalizados, 'Proyectos finalizados')}
			${card(data.proyectos_archivados, 'Proyectos archivados')}
			${card(data.bitacoras_7d, 'Bitácoras en los últimos 7 días')}
			${card(data.fotos, 'Fotos registradas')}
			${card(data.cuestionarios_publicados, 'Cuestionarios publicados', `${data.intentos} intentos respondidos`)}
		</div>
		<h2 class="admin-group-title">Dispositivos y firmware</h2>
		<div class="admin-grid">
			${card(data.dispositivos, 'Dispositivos activos', `${data.dispositivos_vinculados} vinculados a un proyecto`)}
			${card(data.dispositivos_en_linea, 'En línea (últimos 30 min)', '<a href="#dispositivos">Ver todos</a>', data.dispositivos_vinculados > 0 && data.dispositivos_en_linea === 0)}
			${card(data.lecturas_24h, 'Lecturas en las últimas 24 h')}
			${firmwareCard(data.firmware, 'Firmware OTA · sensores')}
			${firmwareCard(data.firmware_camara, 'Firmware OTA · cámara')}
		</div>
		<h2 class="admin-group-title">Catálogos</h2>
		<div class="admin-grid">
			${card(data.instituciones, 'Instituciones activas', '<a href="#instituciones">Gestionar</a>')}
			${card(data.plantas, 'Plantas en el catálogo', '<a href="#plantas">Gestionar</a>')}
		</div>`;
}
