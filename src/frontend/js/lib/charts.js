function numericValue(value) {
	return value === null || value === undefined || value === '' ? Number.NaN : Number(value);
}

// Gráfica de línea en SVG para una métrica de las lecturas.
// settings: { min, max, step, dynamic, color, format, rangeHours, markers }
// markers: marcas de tiempo (ms) que se dibujan como líneas verticales, p. ej. bitácoras.
export function renderLineChart(container, readings, field, settings) {
	if (!container) return;
	const series = readings
		.map((reading) => ({ time: new Date(reading.fecha_lectura).getTime(), value: numericValue(reading[field]) }))
		.filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value));

	if (!series.length) {
		container.innerHTML = '<p class="chart-no-data">Aún no hay mediciones en este periodo.</p>';
		return;
	}

	const gradientId = `${container.id || field}-fill`;
	const width = 720;
	const height = 230;
	const left = 54;
	const right = 14;
	const top = 14;
	const bottom = 34;
	const plotWidth = width - left - right;
	const plotHeight = height - top - bottom;
	const firstReadingTime = series[0].time;
	const lastReadingTime = series.at(-1).time;
	const readingSpan = lastReadingTime - firstReadingTime;
	const minimumSpan = 5 * 60 * 1000;
	const chartStartTime = readingSpan < minimumSpan ? firstReadingTime - (minimumSpan - readingSpan) / 2 : firstReadingTime;
	const chartEndTime = readingSpan < minimumSpan ? lastReadingTime + (minimumSpan - readingSpan) / 2 : lastReadingTime;
	const chartSpan = chartEndTime - chartStartTime;
	const minValue = settings.min;
	let maxValue = settings.max;
	if (settings.dynamic) {
		maxValue = Math.max(settings.min + settings.step, Math.ceil(Math.max(...series.map((point) => point.value)) / settings.step) * settings.step);
	}
	const x = (time) => left + ((time - chartStartTime) / chartSpan) * plotWidth;
	const y = (value) => top + ((maxValue - value) / (maxValue - minValue)) * plotHeight;
	const linePath = series.map((point, index) => `${index ? 'L' : 'M'} ${x(point.time).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ');
	const areaPath = `${linePath} L ${x(series.at(-1).time).toFixed(1)} ${(top + plotHeight).toFixed(1)} L ${x(series[0].time).toFixed(1)} ${(top + plotHeight).toFixed(1)} Z`;
	const gridLines = Array.from({ length: 5 }, (_, index) => {
		const value = maxValue - ((maxValue - minValue) / 4) * index;
		const yPosition = top + (plotHeight / 4) * index;
		return `<g><line x1="${left}" y1="${yPosition}" x2="${width - right}" y2="${yPosition}" class="chart-grid-line"/><text x="${left - 10}" y="${yPosition + 4}" class="chart-axis-label" text-anchor="end">${settings.format(value)}</text></g>`;
	}).join('');
	const timeLabels = Array.from({ length: 5 }, (_, index) => {
		const date = new Date(chartStartTime + (chartSpan / 4) * index);
		const label = (settings.rangeHours || 24) > 24
			? date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
			: date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
		return `<text x="${left + (plotWidth / 4) * index}" y="${height - 8}" class="chart-axis-label" text-anchor="middle">${label}</text>`;
	}).join('');
	const markers = (settings.markers || [])
		.filter((time) => time >= chartStartTime && time <= chartEndTime)
		.map((time) => `<line x1="${x(time).toFixed(1)}" y1="${top}" x2="${x(time).toFixed(1)}" y2="${top + plotHeight}" class="chart-marker-line"/>`)
		.join('');
	const lastPoint = series.at(-1);
	const lastCircle = series.length === 1
		? `<circle cx="${x(lastPoint.time)}" cy="${y(lastPoint.value)}" r="6" fill="${settings.color}"/>`
		: `<circle cx="${x(lastPoint.time)}" cy="${y(lastPoint.value)}" r="5" fill="white" stroke="${settings.color}" stroke-width="3"/>`;
	container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="presentation" aria-hidden="true"><defs><linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${settings.color}" stop-opacity=".24"/><stop offset="100%" stop-color="${settings.color}" stop-opacity=".02"/></linearGradient></defs>${gridLines}${markers}<path d="${areaPath}" fill="url(#${gradientId})"/><path d="${linePath}" fill="none" stroke="${settings.color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${lastCircle}${timeLabels}</svg>`;
}

export const chartPresets = {
	temperatura_c: { min: 0, max: 50, step: 10, color: '#e27644', format: (value) => `${Math.round(value)}°` },
	humedad_suelo_pct: { min: 0, max: 100, step: 20, color: '#219a86', format: (value) => `${Math.round(value)}%` },
	intensidad_luz_lux: { min: 0, max: 100, step: 100, dynamic: true, color: '#d39a18', format: (value) => `${Math.round(value)}` },
};
