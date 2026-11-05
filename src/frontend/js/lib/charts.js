function numericValue(value) {
	return value === null || value === undefined || value === '' ? Number.NaN : Number(value);
}

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

function formatDate(time, rangeHours) {
	const date = new Date(time);
	return (rangeHours || 24) > 24
		? date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
		: date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function formatTooltipDate(time) {
	return new Date(time).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

// Gráfica de línea en SVG para una métrica de las lecturas.
// settings: { min, max, step, dynamic, color, format, rangeHours, markers }
// markers: marcas de tiempo (ms) que se dibujan como líneas verticales, p. ej. bitácoras.
export function renderLineChart(container, readings, field, settings) {
	if (!container) return;
	const series = readings
		.map((reading) => ({ time: new Date(reading.fecha_lectura).getTime(), value: numericValue(reading[field]) }))
		.filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
		.sort((a, b) => a.time - b.time);

	if (!series.length) {
		container.innerHTML = '<p class="chart-no-data"><i class="ti ti-chart-line" aria-hidden="true"></i><span>Aún no hay mediciones en este periodo.</span></p>';
		return;
	}

	const safeId = `${container.id || field}`.replace(/[^a-zA-Z0-9_-]/g, '-');
	const titleId = `${safeId}-title`;
	const descriptionId = `${safeId}-description`;
	const gradientId = `${safeId}-fill`;
	const width = 720;
	const height = 250;
	const left = 58;
	const right = 16;
	const top = 18;
	const bottom = 40;
	const plotWidth = width - left - right;
	const plotHeight = height - top - bottom;
	const firstReadingTime = series[0].time;
	const lastReadingTime = series.at(-1).time;
	const readingSpan = lastReadingTime - firstReadingTime;
	const minimumSpan = 5 * 60 * 1000;
	const chartStartTime = readingSpan < minimumSpan ? firstReadingTime - (minimumSpan - readingSpan) / 2 : firstReadingTime;
	const chartEndTime = readingSpan < minimumSpan ? lastReadingTime + (minimumSpan - readingSpan) / 2 : lastReadingTime;
	const chartSpan = Math.max(chartEndTime - chartStartTime, 1);
	const minValue = Number(settings.min) || 0;
	let maxValue = Number(settings.max) || minValue + (Number(settings.step) || 1);
	if (settings.dynamic) maxValue = Math.max(minValue + settings.step, Math.ceil(Math.max(...series.map((point) => point.value)) / settings.step) * settings.step);
	if (maxValue <= minValue) maxValue = minValue + 1;
	const format = settings.format || ((value) => String(value));
	const x = (time) => left + ((time - chartStartTime) / chartSpan) * plotWidth;
	const y = (value) => top + ((maxValue - value) / (maxValue - minValue)) * plotHeight;
	const linePath = series.map((point, index) => `${index ? 'L' : 'M'} ${x(point.time).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ');
	const areaPath = `${linePath} L ${x(series.at(-1).time).toFixed(1)} ${(top + plotHeight).toFixed(1)} L ${x(series[0].time).toFixed(1)} ${(top + plotHeight).toFixed(1)} Z`;
	const gridLines = Array.from({ length: 5 }, (_, index) => {
		const value = maxValue - ((maxValue - minValue) / 4) * index;
		const yPosition = top + (plotHeight / 4) * index;
		return `<g><line x1="${left}" y1="${yPosition}" x2="${width - right}" y2="${yPosition}" class="chart-grid-line"/><text x="${left - 10}" y="${yPosition + 4}" class="chart-axis-label" text-anchor="end">${escapeHtml(format(value))}</text></g>`;
	}).join('');
	const timeLabels = Array.from({ length: 5 }, (_, index) => {
		const date = chartStartTime + (chartSpan / 4) * index;
		return `<text x="${left + (plotWidth / 4) * index}" y="${height - 10}" class="chart-axis-label" text-anchor="middle">${escapeHtml(formatDate(date, settings.rangeHours))}</text>`;
	}).join('');
	const markers = (settings.markers || [])
		.filter((time) => time >= chartStartTime && time <= chartEndTime)
		.map((time) => `<line x1="${x(time).toFixed(1)}" y1="${top}" x2="${x(time).toFixed(1)}" y2="${top + plotHeight}" class="chart-marker-line"/>`)
		.join('');
	const points = series.map((point, index) => {
		const label = `${formatTooltipDate(point.time)}: ${format(point.value)}`;
		return `<circle class="chart-data-point" cx="${x(point.time).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="${index === series.length - 1 ? 5 : 4}" fill="${escapeHtml(settings.color)}" tabindex="0" focusable="true" aria-label="${escapeHtml(label)}"><title>${escapeHtml(label)}</title></circle>`;
	}).join('');
	const rows = series.map((point) => `<tr><th scope="row">${escapeHtml(formatTooltipDate(point.time))}</th><td>${escapeHtml(format(point.value))}</td></tr>`).join('');
	const label = container.getAttribute('aria-label') || field;
	const csvRows = series.map((point) => `${new Date(point.time).toISOString()},${point.value}`).join('\\n');
	container.innerHTML = `<svg class="monitor-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleId} ${descriptionId}"><title id="${titleId}">${escapeHtml(label)}</title><desc id="${descriptionId}">${series.length} mediciones. Usa el menú de acciones para ver la tabla o exportar los datos.</desc><defs><linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${escapeHtml(settings.color)}" stop-opacity=".22"/><stop offset="100%" stop-color="${escapeHtml(settings.color)}" stop-opacity=".02"/></linearGradient></defs><g aria-hidden="true">${gridLines}${markers}<path d="${areaPath}" fill="url(#${gradientId})"/><path d="${linePath}" fill="none" stroke="${escapeHtml(settings.color)}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${timeLabels}</g>${points}</svg><div class="chart-tooltip" role="status" aria-live="polite" hidden></div><div class="chart-actions"><button type="button" class="chart-actions-trigger" aria-label="Más opciones para ${escapeHtml(label)}" aria-expanded="false"><i class="ti ti-dots" aria-hidden="true"></i></button><div class="chart-actions-menu" hidden><button type="button" data-chart-action="table"><i class="ti ti-table" aria-hidden="true"></i>Ver como tabla</button><button type="button" data-chart-action="csv"><i class="ti ti-download" aria-hidden="true"></i>Exportar datos CSV</button></div></div><div class="chart-table-popover" hidden><div class="chart-table-heading"><strong>${escapeHtml(label)}</strong><button type="button" data-chart-action="close-table" aria-label="Cerrar tabla"><i class="ti ti-x" aria-hidden="true"></i></button></div><div class="chart-table-wrap"><table><caption>${escapeHtml(label)}</caption><thead><tr><th scope="col">Fecha</th><th scope="col">Valor</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;

	const tooltip = container.querySelector('.chart-tooltip');
	const svg = container.querySelector('svg');
	const showTooltip = (point, element) => {
		const pointX = Number(element.getAttribute('cx')) / width * 100;
		const pointY = Number(element.getAttribute('cy')) / height * 100;
		tooltip.innerHTML = `<strong>${escapeHtml(format(point.value))}</strong><span>${escapeHtml(formatTooltipDate(point.time))}</span>`;
		tooltip.style.left = `${Math.min(87, Math.max(13, pointX))}%`;
		tooltip.style.top = `${Math.max(4, pointY - 7)}%`;
		tooltip.hidden = false;
	};
	const hideTooltip = () => { tooltip.hidden = true; };
	container.querySelectorAll('.chart-data-point').forEach((pointElement, index) => {
		pointElement.addEventListener('pointerenter', () => showTooltip(series[index], pointElement));
		pointElement.addEventListener('pointerleave', hideTooltip);
		pointElement.addEventListener('focus', () => showTooltip(series[index], pointElement));
		pointElement.addEventListener('blur', hideTooltip);
	});
	if (svg) svg.addEventListener('pointerleave', hideTooltip);
	const actions = container.querySelector('.chart-actions');
	const trigger = actions?.querySelector('.chart-actions-trigger');
	const menu = actions?.querySelector('.chart-actions-menu');
	const table = container.querySelector('.chart-table-popover');
	trigger?.addEventListener('click', () => {
		const isOpen = !menu.hidden;
		menu.hidden = isOpen;
		trigger.setAttribute('aria-expanded', String(!isOpen));
	});
	menu?.querySelector('[data-chart-action="table"]')?.addEventListener('click', () => {
		table.hidden = false;
		menu.hidden = true;
		trigger.setAttribute('aria-expanded', 'false');
	});
	table?.querySelector('[data-chart-action="close-table"]')?.addEventListener('click', () => { table.hidden = true; });
	menu?.querySelector('[data-chart-action="csv"]')?.addEventListener('click', () => {
		const blob = new Blob([`fecha,valor\\n${csvRows}\\n`], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${safeId}-datos.csv`;
		link.click();
		URL.revokeObjectURL(url);
		menu.hidden = true;
		trigger.setAttribute('aria-expanded', 'false');
	});
}

export const chartPresets = {
	temperatura_c: { min: 0, max: 50, step: 10, color: '#c75b2a', format: (value) => `${Math.round(value)}°` },
	humedad_suelo_pct: { min: 0, max: 100, step: 20, color: '#167c6b', format: (value) => `${Math.round(value)}%` },
	intensidad_luz_lux: { min: 0, max: 100, step: 100, dynamic: true, color: '#a66a00', format: (value) => `${Math.round(value)}` },
};
