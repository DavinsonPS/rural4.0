import { api } from '../lib/api.js';
import { escapeHtml } from '../lib/html.js';
import { renderLineChart, chartPresets } from '../lib/charts.js';
import { renderManagement } from './gestion.js';
import { renderStudentQuizzes } from './cuestionarios.js';
import { mountTimelapse } from '../lib/timelapse.js';
import {
	fullName, levelBadge, localDay, formatDay, formatDateTime, formatMinutesAgo, parseChallenges, challengeLabels, formatNumber,
} from './formato.js';

const header = document.getElementById('project-header');
const alertsBox = document.getElementById('project-alerts');
const managementBox = document.getElementById('management-actions');
const managementMessage = document.getElementById('management-message');
const devicesBox = document.getElementById('devices-body');
const compareBox = document.getElementById('photo-compare');
const timelineBox = document.getElementById('project-timeline');
const chartRange = document.getElementById('chart-range');

const alertIcons = { rojo: 'alert-octagon', naranja: 'alert-triangle', amarillo: 'info-circle' };
let context = null;
let timelapsePlayer = null;

function renderHeader(project, item) {
	const student = fullName(project.usuario);
	const teacher = project.docente ? fullName(project.docente) : 'Sin docente';
	header.innerHTML = `<div><span class="eyebrow">${escapeHtml(project.planta || 'Planta')} · ${escapeHtml(project.institucion || 'Institución')}</span>
		<h1>${escapeHtml(project.nombre)}</h1>
		<p>${escapeHtml(student)}${project.usuario?.usuario ? ` (@${escapeHtml(project.usuario.usuario)})` : ''} · Docente: ${escapeHtml(teacher)} · Inicio: ${escapeHtml(formatDay(project.fecha_inicio))}${project.fecha_fin ? ` · Finalizado: ${escapeHtml(formatDay(project.fecha_fin))}` : ''}</p>
		${project.descripcion ? `<p>${escapeHtml(project.descripcion)}</p>` : ''}</div>
		${levelBadge(item?.nivel || (project.fecha_fin ? 'finalizado' : 'verde'))}`;
}

function renderAlerts(item) {
	const alerts = item?.alertas || [];
	alertsBox.innerHTML = alerts.map((alert) => `<div class="project-alert nivel-${escapeHtml(alert.nivel)}"><i class="ti ti-${alertIcons[alert.nivel] || 'info-circle'}" aria-hidden="true"></i>${escapeHtml(alert.mensaje)}</div>`).join('');
}

function deviceBlock(title, device, fallback) {
	if (!device) return `<div class="device-block"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(fallback)}</p></div>`;
	return `<div class="device-block"><h3>${escapeHtml(title)}</h3><p><strong>${escapeHtml(device.codigo_interno || 'Sin código')}</strong> · ${escapeHtml(device.modelo || 'ESP32')} · ${escapeHtml(device.mac_address || '')}</p><p>Último contacto: ${escapeHtml(formatDateTime(device.fecha_ultimo_contacto))}</p></div>`;
}

function renderDevices(project, item) {
	const sensor = project.id_dispositivo ? { codigo_interno: project.codigo_interno, modelo: project.modelo, mac_address: project.mac_address, fecha_ultimo_contacto: project.fecha_ultimo_contacto } : null;
	const led = project.id_dispositivo
		? `<div class="device-block"><h3>Configuración</h3><p>Luz: ${escapeHtml(project.configuracion_led || 'no definida')} · Color: ${escapeHtml(project.color_led || 'rojo')} · Brillo: ${escapeHtml(project.brillo_led ?? 255)} · Tierra: ${escapeHtml(project.tipo_tierra || 'sin definir')}</p>${item?.sensor ? `<p>Sensor ${escapeHtml(formatMinutesAgo(item.sensor.minutos_sin_contacto))}</p>` : ''}</div>`
		: '';
	devicesBox.innerHTML = deviceBlock('ESP32 de sensores', sensor, 'Sin sensor vinculado.') + led + deviceBlock('ESP32-CAMERA', project.dispositivo_camara, 'Sin cámara vinculada.');
}

function logTimestamp(log) {
	const day = String(log.fecha_bitacora || '').slice(0, 10);
	const time = String(log.hora_riego || '12:00').slice(0, 5);
	return new Date(`${day}T${time}:00`).getTime();
}

function renderCharts() {
	const cutoff = Date.now() - context.hours * 60 * 60 * 1000;
	const readings = context.readings.filter((reading) => new Date(reading.fecha_lectura).getTime() >= cutoff);
	const markers = context.logs.map(logTimestamp).filter(Number.isFinite);
	[['teacher-chart-temp', 'temperatura_c'], ['teacher-chart-soil', 'humedad_suelo_pct'], ['teacher-chart-light', 'intensidad_luz_lux']].forEach(([id, field]) => {
		renderLineChart(document.getElementById(id), readings, field, { ...chartPresets[field], rangeHours: context.hours, markers });
	});
}

function photoCaption(photo) {
	return `${formatDateTime(photo.fecha_fotografia)}${photo.id_dispositivo ? ' · cámara' : ' · subida por el estudiante'}`;
}

function renderCompare() {
	const photos = context.photos.filter((photo) => !photo.oculta).sort((first, second) => new Date(first.fecha_fotografia) - new Date(second.fecha_fotografia));
	if (photos.length < 2) {
		compareBox.innerHTML = `<p class="card-help">${photos.length ? 'Hay una sola foto. Cuando haya más podrás comparar el antes y el después.' : 'Aún no hay fotos en este proyecto.'}</p>`;
		return;
	}
	const photoOptions = (selectedIndex) => photos.map((photo, index) => `<option value="${index}"${index === selectedIndex ? ' selected' : ''}>${escapeHtml(photoCaption(photo))}</option>`).join('');
	compareBox.innerHTML = `<div class="compare-controls">
		<div class="form-row"><label class="form-label" for="compare-before">Antes</label><select id="compare-before">${photoOptions(0)}</select></div>
		<div class="form-row"><label class="form-label" for="compare-after">Después</label><select id="compare-after">${photoOptions(photos.length - 1)}</select></div>
	</div><div class="compare-images" id="compare-images"></div>`;
	const draw = () => {
		const before = photos[Number(compareBox.querySelector('#compare-before').value)];
		const after = photos[Number(compareBox.querySelector('#compare-after').value)];
		compareBox.querySelector('#compare-images').innerHTML = [before, after].map((photo, index) => `<figure><img src="${escapeHtml(photo.url)}" alt="Foto ${index ? 'después' : 'antes'}: ${escapeHtml(photoCaption(photo))}" loading="lazy"><figcaption>${escapeHtml(photoCaption(photo))}</figcaption></figure>`).join('');
	};
	compareBox.querySelectorAll('select').forEach((select) => select.addEventListener('change', draw));
	draw();
}

function average(values) {
	const numbers = values.filter((value) => value !== null && value !== undefined && value !== '').map(Number).filter(Number.isFinite);
	return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}

// Línea de tiempo por día: bitácora, fotos y promedio de sensores en el mismo lugar.
function renderTimeline() {
	const days = new Map();
	const dayEntry = (day) => {
		if (!days.has(day)) days.set(day, { log: null, photos: [], readings: [] });
		return days.get(day);
	};
	context.logs.forEach((log) => { dayEntry(String(log.fecha_bitacora).slice(0, 10)).log = log; });
	context.photos.forEach((photo) => { dayEntry(localDay(photo.fecha_fotografia)).photos.push(photo); });
	context.readings.forEach((reading) => { dayEntry(localDay(reading.fecha_lectura)).readings.push(reading); });
	const ordered = [...days.entries()].sort(([first], [second]) => second.localeCompare(first));
	if (!ordered.length) {
		timelineBox.innerHTML = '<p class="card-help">Aún no hay bitácoras, fotos ni lecturas en este proyecto.</p>';
		return;
	}
	timelineBox.innerHTML = ordered.map(([day, entry]) => {
		const parts = [];
		if (entry.log) {
			const challenges = parseChallenges(entry.log.retos_completados);
			const details = [
				entry.log.agua_aplicada_ml !== null && entry.log.agua_aplicada_ml !== undefined ? `Riego: ${formatNumber(entry.log.agua_aplicada_ml, ' ml', 0)}${entry.log.hora_riego ? ` a las ${String(entry.log.hora_riego).slice(0, 5)}` : ''}` : '',
				entry.log.humedad_suelo_pct !== null && entry.log.humedad_suelo_pct !== undefined ? `Humedad observada: ${formatNumber(entry.log.humedad_suelo_pct, ' %', 0)}` : '',
				entry.log.color_hojas ? `Hojas: ${entry.log.color_hojas}` : '',
			].filter(Boolean).join(' · ');
			parts.push(`<div class="timeline-entry"><div class="timeline-entry-title"><i class="ti ti-notebook" aria-hidden="true"></i>Bitácora · ${challenges.length}/6 retos</div>
				${challenges.length ? `<div class="challenge-chips">${challenges.map((challenge) => `<span class="challenge-chip">${escapeHtml(challengeLabels[challenge])}</span>`).join('')}</div>` : ''}
				${entry.log.observacion ? `<p>${escapeHtml(entry.log.observacion)}</p>` : ''}
				${details ? `<p>${escapeHtml(details)}</p>` : ''}</div>`);
		}
		if (entry.photos.length) {
			parts.push(`<div class="timeline-entry"><div class="timeline-entry-title"><i class="ti ti-camera" aria-hidden="true"></i>${entry.photos.length} foto${entry.photos.length === 1 ? '' : 's'}</div><div class="timeline-photos">${entry.photos.map((photo) => `<figure class="timeline-photo${photo.oculta ? ' is-hidden' : ''}"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photoCaption(photo))}" loading="lazy">${photo.oculta ? '<span class="hidden-label">Oculta para el estudiante</span>' : ''}<button type="button" data-photo="${Number(photo.id)}" data-hidden="${photo.oculta ? '1' : '0'}"><i class="ti ti-${photo.oculta ? 'eye' : 'eye-off'}" aria-hidden="true"></i>${photo.oculta ? 'Mostrar' : 'Ocultar'}</button></figure>`).join('')}</div></div>`);
		}
		if (entry.readings.length) {
			const temperature = average(entry.readings.map((reading) => reading.temperatura_c));
			const soil = average(entry.readings.map((reading) => reading.humedad_suelo_pct));
			const light = average(entry.readings.map((reading) => reading.intensidad_luz_lux));
			parts.push(`<div class="timeline-entry"><div class="timeline-entry-title"><i class="ti ti-activity" aria-hidden="true"></i>Sensores · ${entry.readings.length} lecturas</div><p>Promedios: temperatura ${escapeHtml(formatNumber(temperature, ' °C'))} · suelo ${escapeHtml(formatNumber(soil, ' %', 0))} · luz ${escapeHtml(formatNumber(light, ' lx', 0))}</p></div>`);
		}
		return `<section class="timeline-day"><div class="timeline-day-heading"><strong>${escapeHtml(formatDay(day))}</strong>${entry.log ? '' : '<span class="chip">Sin bitácora</span>'}</div>${parts.join('')}</section>`;
	}).join('');
}

timelineBox.addEventListener('click', async (event) => {
	const button = event.target.closest('[data-photo]');
	if (!button || !context) return;
	button.disabled = true;
	try {
		const hide = button.dataset.hidden !== '1';
		await api(`/api/docente/fotografias/${button.dataset.photo}`, { method: 'PATCH', body: { oculta: hide } });
		const photo = context.photos.find((item) => Number(item.id) === Number(button.dataset.photo));
		if (photo) photo.oculta = hide;
		renderTimeline();
		renderCompare();
	} catch (error) {
		button.disabled = false;
		window.alert(error.message);
	}
});

chartRange.addEventListener('click', (event) => {
	const button = event.target.closest('[data-hours]');
	if (!button || !context) return;
	context.hours = Number(button.dataset.hours);
	chartRange.querySelectorAll('button').forEach((item) => {
		item.classList.toggle('is-active', item === button);
		item.setAttribute('aria-pressed', String(item === button));
	});
	renderCharts();
});

export async function showProject(projectId) {
	header.innerHTML = '<div><span class="eyebrow">Cargando</span><h1>Consultando el proyecto…</h1></div>';
	[alertsBox, managementBox, managementMessage, devicesBox, compareBox, timelineBox].forEach((element) => { element.innerHTML = ''; });
	try {
		const [summary, panelProjects, logs, photos, readings] = await Promise.all([
			api(`/api/proyectos/resumen/${projectId}`),
			api('/api/docente/proyectos?estado=todos'),
			api(`/api/monitoreo/bitacoras?id_proyecto=${projectId}`),
			api(`/api/monitoreo/fotografias?id_proyecto=${projectId}&origen=estudiante`),
			api(`/api/proyectos/resumen/${projectId}/lecturas`),
		]);
		const item = panelProjects.find((project) => Number(project.id) === Number(projectId));
		context = { project: summary.project, item, logs, photos, readings, hours: context?.project?.id === summary.project.id ? context.hours : 24 };
		renderHeader(summary.project, item);
		renderAlerts(item);
		renderDevices(summary.project, item);
		renderManagement(managementBox, managementMessage, summary.project, async (message) => {
			await showProject(projectId);
			managementMessage.textContent = message || '';
		});
		renderCharts();
		renderCompare();
		renderTimeline();
		renderStudentQuizzes(document.getElementById('project-quizzes'), projectId);
		timelapsePlayer?.stop();
		timelapsePlayer = mountTimelapse(document.getElementById('teacher-timelapse'), { projectId, allowHide: true });
	} catch (error) {
		header.innerHTML = `<div><span class="eyebrow">Proyecto</span><h1>No fue posible abrir el proyecto</h1><p>${escapeHtml(error.status === 404 ? 'El proyecto no existe o no está asignado a ti.' : error.message)}</p></div>`;
	}
}
