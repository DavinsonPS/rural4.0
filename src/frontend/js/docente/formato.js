import { escapeHtml } from '../lib/html.js';

export const levelLabels = {
	rojo: 'Atender hoy',
	naranja: 'Revisar equipo',
	amarillo: 'Pendiente',
	verde: 'Al día',
	finalizado: 'Finalizado',
};

export const challengeLabels = {
	color: 'Color',
	crecer: 'Crecimiento',
	compost: 'Compost',
	riego: 'Riego',
	plagas: 'Plagas',
	foto: 'Foto',
};

export function fullName(person) {
	return [person?.nombres, person?.apellidos].filter(Boolean).join(' ').trim();
}

export function levelBadge(level) {
	return `<span class="nivel-badge nivel-${escapeHtml(level)}"><span class="nivel-dot" aria-hidden="true"></span>${escapeHtml(levelLabels[level] || level)}</span>`;
}

// Fecha local del navegador en formato AAAA-MM-DD (evita que UTC cambie el día).
export function localDay(value) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return String(value || '').slice(0, 10);
	return date.toLocaleDateString('en-CA');
}

export function formatDay(day) {
	if (!day) return 'Sin registro';
	const date = new Date(`${String(day).slice(0, 10)}T12:00:00`);
	if (Number.isNaN(date.getTime())) return escapeHtml(day);
	return date.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
	if (!value) return 'Nunca';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return 'Nunca';
	return date.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatMinutesAgo(minutes) {
	if (minutes === null || minutes === undefined) return 'nunca se ha conectado';
	const value = Number(minutes);
	if (value < 1) return 'hace menos de 1 min';
	if (value < 60) return `hace ${value} min`;
	if (value < 60 * 48) return `hace ${Math.round(value / 60)} h`;
	return `hace ${Math.round(value / 1440)} días`;
}

export function parseChallenges(value) {
	try {
		const parsed = typeof value === 'string' ? JSON.parse(value) : value;
		return Array.isArray(parsed) ? [...new Set(parsed.filter((challenge) => challengeLabels[challenge]))] : [];
	} catch {
		return [];
	}
}

export function formatNumber(value, suffix = '', decimals = 1) {
	if (value === null || value === undefined || value === '') return 'Sin dato';
	const number = Number(value);
	return Number.isFinite(number) ? `${number.toFixed(decimals)}${suffix}` : 'Sin dato';
}
