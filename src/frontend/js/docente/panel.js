import { api } from '../lib/api.js';
import { escapeHtml } from '../lib/html.js';
import { fullName, levelBadge, formatDay, formatMinutesAgo } from './formato.js';

const body = document.getElementById('projects-body');
const levelFilter = document.getElementById('level-filter');
const statusFilter = document.getElementById('status-filter');
const searchInput = document.getElementById('student-search');
const levelOrder = { rojo: 0, naranja: 1, amarillo: 2, verde: 3, finalizado: 4 };

const state = { projects: [], level: '', search: '' };

function setText(id, value) {
	document.getElementById(id).textContent = value;
}

function renderStats(summary) {
	setText('stat-students', summary.estudiantes_activos);
	setText('stat-projects', summary.proyectos_en_curso);
	setText('stat-logs', summary.bitacoras_al_dia_pct === null ? '–' : `${summary.bitacoras_al_dia_pct}%`);
	setText('stat-devices', summary.dispositivos_vinculados ? `${summary.dispositivos_en_linea}/${summary.dispositivos_vinculados}` : '–');
	setText('stat-alerts', summary.alertas.rojo);
}

function deviceDots(project) {
	const dots = [];
	if (project.sensor) {
		dots.push(`<span class="device-dot ${project.sensor.en_linea ? 'is-online' : 'is-offline'}" title="Sensor ${escapeHtml(formatMinutesAgo(project.sensor.minutos_sin_contacto))}"><i class="ti ti-cpu" aria-hidden="true"></i>Sensor</span>`);
	}
	if (project.camara) dots.push('<span class="device-dot"><i class="ti ti-camera" aria-hidden="true"></i>Cámara</span>');
	return dots.length ? `<div class="device-dots">${dots.join('')}</div>` : '<small>Sin dispositivos</small>';
}

function renderTable() {
	const search = state.search.toLowerCase();
	const rows = state.projects
		.filter((project) => !state.level || project.nivel === state.level)
		.filter((project) => !search || `${fullName(project.estudiante)} ${project.estudiante.usuario} ${project.nombre}`.toLowerCase().includes(search))
		.sort((first, second) => levelOrder[first.nivel] - levelOrder[second.nivel] || fullName(first.estudiante).localeCompare(fullName(second.estudiante)));
	if (!rows.length) {
		body.innerHTML = `<tr><td colspan="6" class="table-empty">${state.projects.length ? 'Ningún proyecto coincide con el filtro.' : 'Aún no tienes proyectos asignados. Aparecerán cuando un estudiante te elija como docente.'}</td></tr>`;
		return;
	}
	body.innerHTML = rows.map((project) => `<tr data-project="${Number(project.id)}">
		<td>${escapeHtml(fullName(project.estudiante))}<small>@${escapeHtml(project.estudiante.usuario)}</small></td>
		<td>${escapeHtml(project.nombre)}<small>${escapeHtml(project.planta)}</small></td>
		<td>${levelBadge(project.nivel)}${project.alertas[0] ? `<div class="row-alert">${escapeHtml(project.alertas[0].mensaje)}${project.alertas.length > 1 ? ` (+${project.alertas.length - 1})` : ''}</div>` : ''}</td>
		<td>${escapeHtml(formatDay(project.ultima_bitacora))}<small>${project.bitacoras_7d}/7 días con registro</small></td>
		<td>${deviceDots(project)}</td>
		<td><a class="secondary-btn" href="#proyecto/${Number(project.id)}">Ver</a></td>
	</tr>`).join('');
}

export async function loadPanel() {
	body.innerHTML = '<tr><td colspan="6" class="table-empty">Cargando proyectos…</td></tr>';
	try {
		const [summary, projects] = await Promise.all([
			api('/api/docente/resumen'),
			api(`/api/docente/proyectos?estado=${encodeURIComponent(statusFilter.value)}`),
		]);
		renderStats(summary);
		state.projects = projects;
		renderTable();
	} catch (error) {
		body.innerHTML = `<tr><td colspan="6" class="table-empty">${escapeHtml(error.message)}</td></tr>`;
	}
}

export function initPanel() {
	levelFilter.addEventListener('click', (event) => {
		const button = event.target.closest('[data-level]');
		if (!button) return;
		state.level = button.dataset.level;
		levelFilter.querySelectorAll('button').forEach((item) => {
			item.classList.toggle('is-active', item === button);
			item.setAttribute('aria-pressed', String(item === button));
		});
		renderTable();
	});
	statusFilter.addEventListener('change', loadPanel);
	searchInput.addEventListener('input', () => {
		state.search = searchInput.value.trim();
		renderTable();
	});
	body.addEventListener('click', (event) => {
		const row = event.target.closest('[data-project]');
		if (row && !event.target.closest('a')) window.location.hash = `#proyecto/${row.dataset.project}`;
	});
}
