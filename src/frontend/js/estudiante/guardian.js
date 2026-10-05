import { api } from '../lib/api.js';
import { cachedUser } from '../lib/sesion.js';
import { guardianSvg } from './guardian-svg.js';

// Guardián acompaña al estudiante con mensajes según el estado real de su proyecto.
// No consulta la API del proyecto por su cuenta: escucha los eventos que emite el
// dashboard (rural40:*) y solo pide la lista de cuestionarios.
//
// Cada mensaje: { key, prioridad, animo, texto, accion?: { label, view } }
// Prioridad: 100 urgente · 80 logro · 70 cuestionario · 60 misiones · 50 configuración · 10 curiosidad

const NAME = 'Guardián';
const STORAGE_KEY = 'rural40_guardian';
const CHALLENGES = ['color', 'crecer', 'compost', 'riego', 'plagas', 'foto'];
const CURIOSITIES = [
	'¿Sabías que el color morado de la lechuga y la col se debe a pigmentos llamados antocianinas?',
	'Las raíces también respiran: por eso regar de más puede hacerle daño a tu planta.',
	'La clorofila es la que pinta las hojas de verde y atrapa la luz para fabricar alimento.',
	'Si tocas la tierra a 2 o 3 cm de profundidad sabrás si de verdad necesita agua.',
	'Las mariquitas son aliadas: se comen a los pulgones que atacan las hojas.',
	'Una planta con poca luz se estira buscándola y sus hojas se ponen pálidas.',
	'El compost es comida para el suelo: restos de frutas y verduras convertidos en abono.',
	'Mi sensor guarda una lectura cada 5 minutos. ¡Mira la gráfica en "Mi planta"!',
	'Mide tu planta siempre desde la tierra hasta la punta más alta, así puedes comparar.',
	'Regar temprano en la mañana ayuda a que el agua no se evapore con el sol.',
];

const state = { user: cachedUser(), project: null, reading: null, logs: null, quizzes: null, loaded: false };
let root;
let bubble;
let textElement;
let actionsElement;
let queue = [];
let position = 0;
let lastTopKey = null;
let hideTimer = null;
let curiosityIndex = Math.floor(Math.random() * CURIOSITIES.length);

function todayKey() {
	return new Date().toLocaleDateString('en-CA');
}

function readPreferences() {
	try {
		const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
		return saved.day === todayKey() ? saved : { day: todayKey(), seen: [] };
	} catch {
		return { day: todayKey(), seen: [] };
	}
}

function savePreferences(changes) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readPreferences(), ...changes, day: todayKey() }));
	} catch { /* almacenamiento no disponible */ }
}

function isNight() {
	const hour = new Date().getHours();
	return hour >= 21 || hour < 6;
}

function number(value) {
	return value === null || value === undefined || value === '' ? null : Number(value);
}

function minutesSince(value) {
	const time = new Date(value).getTime();
	return Number.isFinite(time) ? (Date.now() - time) / 60000 : null;
}

// Mensajes posibles según el estado actual, del más al menos importante.
function buildMessages() {
	const messages = [];
	const add = (message) => messages.push(message);
	const name = state.user?.nombres?.split(' ')[0] || '';
	const project = state.project;
	const reading = state.reading;

	if (state.loaded && !project) {
		add({ key: 'sin-proyecto', prioridad: 50, animo: 'normal', texto: `¡Hola${name ? `, ${name}` : ''}! Soy ${NAME}. Crea tu primer proyecto y cuidaremos una planta juntos.` });
	}
	if (project?.finalizado) {
		add({ key: `finalizado-${project.id}`, prioridad: 45, animo: 'feliz', texto: `¡Terminamos "${project.nombre}"! Mira en "Mis registros" y en las fotos todo lo que lograste.`, accion: { label: 'Ver registros', view: 'records' } });
	}
	if (project && !project.finalizado) {
		if (!project.id_dispositivo) {
			add({ key: 'sin-sensor', prioridad: 50, animo: 'normal', texto: 'Cuando vincules el ESP32 de sensores podré sentir la tierra y la temperatura de tu planta.' });
		} else {
			const minutes = minutesSince(project.fecha_ultimo_contacto);
			if (minutes === null || minutes > 60) {
				add({ key: 'sin-datos', prioridad: 90, animo: 'confundido', texto: 'Hace rato no recibo datos del sensor. ¿Está conectado y con Wi-Fi?' });
			}
		}
		if (reading && project.id_dispositivo) {
			const soil = number(reading.humedad_suelo_pct);
			const temperature = number(reading.temperatura_c);
			if (reading.sensor_desconectado || reading.sensor_ambiente_desconectado) {
				add({ key: 'sensor-cero', prioridad: 95, animo: 'confundido', texto: 'No siento la temperatura ni la humedad del aire… ¿se soltó algún cable del sensor?' });
			}
			if (soil !== null && soil < 30) {
				add({ key: 'sed', prioridad: 100, animo: 'preocupado', texto: `¡Tengo sed! La tierra está al ${Math.round(soil)} %. ¿Revisamos el riego?`, accion: { label: 'Ir a misiones', view: 'missions' } });
			} else if (soil !== null && soil > 85) {
				add({ key: 'mucha-agua', prioridad: 85, animo: 'preocupado', texto: `La tierra está muy mojada (${Math.round(soil)} %). Mejor esperemos antes de volver a regar.` });
			}
			if (temperature !== null && temperature > 35) {
				add({ key: 'calor', prioridad: 100, animo: 'preocupado', texto: `¡Uf, ${temperature.toFixed(1)} °C! Busquemos un poco de sombra para la planta.` });
			} else if (temperature !== null && temperature > 0 && temperature < 10) {
				add({ key: 'frio', prioridad: 95, animo: 'preocupado', texto: `Brrr, ${temperature.toFixed(1)} °C. Protejamos la planta del frío.` });
			}
			if (soil !== null && soil >= 30 && soil <= 85 && temperature !== null && temperature >= 15 && temperature <= 30) {
				add({ key: 'planta-bien', prioridad: 20, animo: 'feliz', texto: `¡La planta está contenta! Tierra al ${Math.round(soil)} % y ${temperature.toFixed(1)} °C.` });
			}
		}
		if (state.logs) {
			const today = state.logs.find((log) => String(log.fecha_bitacora || '').slice(0, 10) === todayKey());
			let done = [];
			try { done = JSON.parse(today?.retos_completados || '[]'); } catch { done = []; }
			const count = new Set(done.filter((challenge) => CHALLENGES.includes(challenge))).size;
			if (count === CHALLENGES.length) {
				add({ key: `mision-completa-${todayKey()}`, prioridad: 80, animo: 'celebrando', texto: '¡Misión completa! Hiciste los 6 retos de hoy. ¡Eres un gran guardián de la huerta! 🎉' });
			} else if (!isNight()) {
				const missing = CHALLENGES.length - count;
				add({ key: `retos-${count}`, prioridad: 60, animo: 'normal', texto: count ? `Llevas ${count} de 6 misiones hoy. ¡Te faltan ${missing}, vamos!` : 'Hoy no hemos hecho misiones. ¿Empezamos observando el color de las hojas?', accion: { label: 'Ir a misiones', view: 'missions' } });
			}
		}
	}
	const pending = (state.quizzes || []).filter((quiz) => !quiz.respondido && !quiz.cerrado);
	if (pending.length) {
		add({ key: `cuestionario-${pending[0].id}`, prioridad: 70, animo: 'feliz', texto: pending.length === 1 ? `Tu docente publicó "${pending[0].titulo}". ¡Te espero en Cuestionarios!` : `Tienes ${pending.length} cuestionarios por responder. ¡Vamos a ponernos a prueba!`, accion: { label: 'Ir a cuestionarios', view: 'quizzes' } });
	}
	if (isNight() && !messages.some((message) => message.prioridad >= 90)) {
		add({ key: 'noche', prioridad: 55, animo: 'dormido', texto: 'Zzz… de noche las plantas también descansan. ¡Nos vemos mañana!' });
	}
	return messages.sort((first, second) => second.prioridad - first.prioridad);
}

function curiosity() {
	curiosityIndex = (curiosityIndex + 1) % CURIOSITIES.length;
	return { key: `curiosidad-${curiosityIndex}`, prioridad: 10, animo: 'normal', texto: CURIOSITIES[curiosityIndex] };
}

function setMood(mood) {
	root.dataset.mood = mood || 'normal';
}

function show(message, { autoHide = true } = {}) {
	clearTimeout(hideTimer);
	setMood(message.animo);
	textElement.textContent = message.texto;
	actionsElement.innerHTML = '';
	if (message.accion) {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'is-primary';
		button.textContent = message.accion.label;
		button.addEventListener('click', () => {
			document.querySelector(`.nav-item[data-view="${message.accion.view}"]`)?.click();
			hideBubble();
		});
		actionsElement.append(button);
	}
	const next = document.createElement('button');
	next.type = 'button';
	next.textContent = 'Otro consejo';
	next.addEventListener('click', showNext);
	actionsElement.append(next);
	root.classList.remove('is-minimized');
	bubble.hidden = false;
	if (autoHide && message.prioridad < 90) hideTimer = setTimeout(hideBubble, 15000);
}

function hideBubble() {
	clearTimeout(hideTimer);
	bubble.hidden = true;
	const top = queue[0];
	setMood(top && top.prioridad >= 90 ? top.animo : isNight() ? 'dormido' : 'normal');
}

// Recorre los mensajes vigentes y, al terminarlos, sigue con curiosidades.
function showNext() {
	position += 1;
	show(position < queue.length ? queue[position] : curiosity(), { autoHide: false });
}

// Se llama cada vez que cambian los datos. Solo habla solo si hay algo nuevo e importante,
// para no interrumpir al estudiante con el mismo mensaje una y otra vez.
// Minimizado, solo cambia de cara (preocupado, feliz…) sin abrir la burbuja.
function refresh() {
	queue = buildMessages();
	position = 0;
	const top = queue[0];
	if (!top) return;
	if (bubble.hidden) setMood(top.prioridad >= 60 ? top.animo : isNight() ? 'dormido' : 'normal');
	if (top.key === lastTopKey) return;
	lastTopKey = top.key;
	const preferences = readPreferences();
	if (preferences.minimized) return;
	if (preferences.seen.includes(top.key) && top.prioridad < 90) return;
	savePreferences({ seen: [...new Set([...preferences.seen, top.key])].slice(-30) });
	show(top);
}

function react(message) {
	show({ prioridad: 50, ...message });
	root.classList.add('is-waving');
	setTimeout(() => root.classList.remove('is-waving'), 1600);
}

async function loadQuizzes() {
	try {
		state.quizzes = await api('/api/cuestionarios');
		refresh();
	} catch { /* sin cuestionarios disponibles */ }
}

function mount() {
	root = document.createElement('aside');
	root.className = 'guardian';
	root.dataset.mood = isNight() ? 'dormido' : 'normal';
	root.setAttribute('aria-label', `${NAME}, tu compañero de huerta`);
	root.innerHTML = `<button type="button" class="guardian-figure" aria-label="Hablar con ${NAME}">${guardianSvg()}</button>
		<div class="guardian-bubble" role="status" aria-live="polite" hidden>
			<button type="button" class="guardian-close" aria-label="Cerrar mensaje"><i class="ti ti-x" aria-hidden="true"></i></button>
			<span class="guardian-name">${NAME}</span>
			<p class="guardian-text"></p>
			<div class="guardian-actions"></div>
		</div>`;
	document.body.append(root);
	document.body.classList.add('has-guardian');
	bubble = root.querySelector('.guardian-bubble');
	textElement = root.querySelector('.guardian-text');
	actionsElement = root.querySelector('.guardian-actions');
	if (readPreferences().minimized) root.classList.add('is-minimized');

	root.querySelector('.guardian-figure').addEventListener('click', () => {
		if (root.classList.contains('is-minimized')) {
			savePreferences({ minimized: false });
			root.classList.remove('is-minimized');
		}
		if (bubble.hidden) {
			position = 0;
			show(queue[0] || curiosity(), { autoHide: false });
		} else {
			showNext();
		}
	});
	root.querySelector('.guardian-close').addEventListener('click', () => {
		hideBubble();
		savePreferences({ minimized: true });
		root.classList.add('is-minimized');
	});
}

// --- Eventos del dashboard ---
document.addEventListener('rural40:usuario', (event) => { state.user = event.detail; });
document.addEventListener('rural40:proyecto', (event) => {
	const changed = state.project?.id !== event.detail?.project?.id;
	state.project = event.detail?.project || null;
	state.reading = event.detail?.ultima_lectura || state.reading;
	if (changed) { state.logs = null; state.reading = event.detail?.ultima_lectura || null; }
	state.loaded = true;
	refresh();
});
document.addEventListener('rural40:sin-proyecto', () => {
	state.project = null;
	state.reading = null;
	state.logs = null;
	state.loaded = true;
	refresh();
});
document.addEventListener('rural40:lectura', (event) => { state.reading = event.detail; refresh(); });
document.addEventListener('rural40:bitacoras', (event) => { state.logs = event.detail; refresh(); });
document.addEventListener('rural40:registro-guardado', (event) => {
	react({ animo: 'feliz', texto: event.detail?.conFoto ? '¡Qué bien se ve tu planta! Guardé tu registro y la foto.' : '¡Listo! Guardé tu registro. Cada observación cuenta.' });
});
document.addEventListener('rural40:cuestionario-enviado', (event) => {
	const pct = event.detail?.pct ?? 0;
	react({ animo: pct >= 80 ? 'celebrando' : 'feliz', texto: pct >= 80 ? `¡${event.detail.correctas} de ${event.detail.total}! Sabes mucho de plantas. 🎉` : `Obtuviste ${event.detail.correctas} de ${event.detail.total}. Cuando cierre el cuestionario repasamos juntos las respuestas.` });
	loadQuizzes();
});

mount();
loadQuizzes();
// Revisa de nuevo cada 10 minutos (por ejemplo, para pasar a "dormido" de noche).
setInterval(refresh, 10 * 60 * 1000);
