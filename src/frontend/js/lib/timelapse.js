import { api } from './api.js';

// Reproductor de timelapse con las fotos de la ESP32-CAMERA de un proyecto.
// mountTimelapse(container, { projectId, allowHide }) — allowHide lo usa el docente para
// ocultar un cuadro inapropiado (PATCH /api/docente/fotografias/:id).
const RANGES = [['24h', '24 h'], ['7d', '7 días'], ['30d', '30 días'], ['todo', 'Todo']];
const SPEEDS = [[2, 'Lento'], [6, 'Normal'], [12, 'Rápido']];

function formatFrameDate(value) {
	const date = new Date(String(value).replace(' ', 'T'));
	return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function mountTimelapse(container, { projectId, allowHide = false }) {
	const state = { range: '7d', frames: [], total: 0, index: 0, playing: false, fps: 6, timer: null, cache: new Map() };

	container.innerHTML = `<div class="timelapse">
		<div class="timelapse-toolbar">
			<div class="range-switch" role="group" aria-label="Periodo del timelapse">${RANGES.map(([value, label]) => `<button type="button" data-range="${value}" aria-pressed="${value === state.range}" class="${value === state.range ? 'is-active' : ''}">${label}</button>`).join('')}</div>
			<span class="timelapse-count" aria-live="polite"></span>
		</div>
		<div class="timelapse-stage">
			<img class="timelapse-image" alt="" hidden>
			<div class="timelapse-empty"></div>
			<span class="timelapse-date" hidden></span>
		</div>
		<div class="timelapse-controls" hidden>
			<input type="range" class="timelapse-slider" min="0" max="0" value="0" aria-label="Cuadro del timelapse">
			<label class="timelapse-speed"><span class="sr-only">Velocidad</span><select>${SPEEDS.map(([value, label]) => `<option value="${value}"${value === state.fps ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
			${allowHide ? '<button type="button" class="secondary-btn timelapse-hide"><i class="ti ti-eye-off" aria-hidden="true"></i>Ocultar cuadro</button>' : ''}
			<button type="button" class="timelapse-play save-btn" aria-label="Reproducir"><i class="ti ti-player-play" aria-hidden="true"></i></button>
		</div>
	</div>`;

	const image = container.querySelector('.timelapse-image');
	const empty = container.querySelector('.timelapse-empty');
	const dateLabel = container.querySelector('.timelapse-date');
	const controls = container.querySelector('.timelapse-controls');
	const slider = container.querySelector('.timelapse-slider');
	const playButton = container.querySelector('.timelapse-play');
	const count = container.querySelector('.timelapse-count');

	// Si un archivo no está en el servidor, se descarta ese cuadro y se sigue con los demás.
	image.addEventListener('error', () => {
		const broken = state.frames[state.index];
		if (!broken) return;
		state.frames.splice(state.index, 1);
		slider.max = String(Math.max(0, state.frames.length - 1));
		if (!state.frames.length) { load(); return; }
		show(Math.min(state.index, state.frames.length - 1));
	});

	// Precarga los siguientes cuadros para que la reproducción no parpadee.
	function preload(fromIndex) {
		for (let offset = 0; offset < 8; offset += 1) {
			const frame = state.frames[fromIndex + offset];
			if (frame && !state.cache.has(frame.url)) {
				const preloadImage = new Image();
				preloadImage.src = frame.url;
				state.cache.set(frame.url, preloadImage);
			}
		}
	}

	function show(index) {
		const frame = state.frames[index];
		if (!frame) return;
		state.index = index;
		image.src = frame.url;
		image.alt = `Foto de la cámara del ${formatFrameDate(frame.fecha)}`;
		dateLabel.textContent = formatFrameDate(frame.fecha);
		slider.value = String(index);
		preload(index + 1);
	}

	function stop() {
		state.playing = false;
		clearInterval(state.timer);
		playButton.innerHTML = '<i class="ti ti-player-play" aria-hidden="true"></i>';
		playButton.setAttribute('aria-label', 'Reproducir');
	}

	function play() {
		if (state.frames.length < 2) return;
		if (state.index >= state.frames.length - 1) show(0);
		state.playing = true;
		playButton.innerHTML = '<i class="ti ti-player-pause" aria-hidden="true"></i>';
		playButton.setAttribute('aria-label', 'Pausar');
		clearInterval(state.timer);
		state.timer = setInterval(() => {
			if (state.index >= state.frames.length - 1) { stop(); return; }
			show(state.index + 1);
		}, 1000 / state.fps);
	}

	async function load() {
		stop();
		empty.hidden = false;
		empty.textContent = 'Cargando fotos de la cámara…';
		try {
			const data = await api(`/api/monitoreo/timelapse?id_proyecto=${projectId}&rango=${state.range}`);
			state.frames = data.cuadros;
			state.total = data.total;
		} catch (error) {
			state.frames = [];
			empty.textContent = error.message;
			return;
		}
		const hasFrames = state.frames.length > 0;
		image.hidden = !hasFrames;
		dateLabel.hidden = !hasFrames;
		controls.hidden = !hasFrames;
		empty.hidden = hasFrames;
		empty.innerHTML = hasFrames ? '' : '<i class="ti ti-camera-off" aria-hidden="true"></i><span>Aún no hay fotos de la ESP32-CAMERA en este periodo. Vincula la cámara al proyecto para que empiece a registrar el crecimiento.</span>';
		count.textContent = hasFrames
			? `${state.frames.length} cuadros${state.total > state.frames.length ? ` (de ${state.total} fotos, repartidos en el periodo)` : ''}`
			: '';
		slider.max = String(Math.max(0, state.frames.length - 1));
		if (hasFrames) show(state.frames.length - 1);
	}

	container.querySelector('.range-switch').addEventListener('click', (event) => {
		const button = event.target.closest('[data-range]');
		if (!button) return;
		state.range = button.dataset.range;
		container.querySelectorAll('[data-range]').forEach((item) => {
			item.classList.toggle('is-active', item === button);
			item.setAttribute('aria-pressed', String(item === button));
		});
		load();
	});
	playButton.addEventListener('click', () => (state.playing ? stop() : play()));
	slider.addEventListener('input', () => { stop(); show(Number(slider.value)); });
	container.querySelector('.timelapse-speed select').addEventListener('change', (event) => {
		state.fps = Number(event.target.value);
		if (state.playing) play();
	});
	container.querySelector('.timelapse-hide')?.addEventListener('click', async () => {
		const frame = state.frames[state.index];
		if (!frame || !window.confirm('¿Ocultar esta foto? El estudiante dejará de verla.')) return;
		try {
			await api(`/api/docente/fotografias/${frame.id}`, { method: 'PATCH', body: { oculta: true } });
			await load();
		} catch (error) {
			window.alert(error.message);
		}
	});

	load();
	return { reload: load, stop };
}
