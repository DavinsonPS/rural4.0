const navigationItems = document.querySelectorAll('.nav-item');
const colorButtons = document.querySelectorAll('.color-btn');
const humiditySlider = document.getElementById('sl-hum');
const humidityValue = document.getElementById('sl-val');
const plantForm = document.getElementById('plant-form');
const dailyLogDate = document.getElementById('daily-log-date');
const dailyPhoto = document.getElementById('daily-photo');
const dailyLogsList = document.getElementById('daily-logs-list');
const dailyLogCareStatus = document.getElementById('daily-log-care-status');
const questItems = document.querySelectorAll('.quest-item');
const questProgressFill = document.getElementById('quest-progress-fill');
const questProgressLabel = document.getElementById('quest-progress-label');
const questLevel = document.getElementById('quest-level');
const questMessage = document.getElementById('quest-message');
const questModal = document.getElementById('quest-modal');
const questModalForm = document.getElementById('quest-modal-form');
const questModalClose = document.getElementById('quest-modal-close');
const questModalCancel = document.getElementById('quest-modal-cancel');
const questComplete = document.getElementById('quest-complete');
const questScene = document.getElementById('quest-scene');
const questModalTitle = document.getElementById('quest-modal-title');
const questModalInstruction = document.getElementById('quest-modal-instruction');
const questCompletedNote = document.getElementById('quest-completed-note');
const photoAlbum = document.getElementById('photo-album');
const formError = document.getElementById('form-error');
const saveButton = document.querySelector('#plant-form .save-btn');
const ledLight = document.getElementById('led-light');
const ledColor = document.getElementById('led-color');
const soilType = document.getElementById('soil-type');
const dashboardViews = document.querySelectorAll('[data-dashboard-view]');
const shell = document.querySelector('.shell');
const projectForm = document.getElementById('project-form');
const projectNameInput = document.getElementById('project-name');
const projectPlantInput = document.getElementById('project-plant');
const projectTeacherInput = document.getElementById('project-teacher');
const projectDescriptionInput = document.getElementById('project-description');
const projectSelect = document.getElementById('project-select');
const projectList = document.getElementById('project-list');
const showProjectsButton = document.getElementById('show-projects');
const addProjectButton = document.getElementById('add-project');
const projectFormMessage = document.getElementById('project-form-message');
const projectBannerTitle = document.querySelector('.project-banner h1');
const projectBannerSubtitle = document.querySelector('.project-banner p');
const deviceForm = document.getElementById('device-form');
const registerDeviceButton = document.getElementById('register-device');
const linkDeviceButton = document.getElementById('link-device');
const deviceStatus = document.getElementById('device-status');
const deviceMessage = document.getElementById('device-form-message');
const deviceLinkCode = document.getElementById('device-link-code');
const deviceApiKey = document.getElementById('device-api-key');
const deviceLinkedSummary = document.getElementById('device-linked-summary');
const linkedDeviceCode = document.getElementById('linked-device-code');
const linkedDeviceConfig = document.getElementById('linked-device-config');
const unlinkDeviceButton = document.getElementById('unlink-device');
const newDeviceButton = document.getElementById('new-device-button');
const newDeviceModal = document.getElementById('new-device-modal');
const closeNewDeviceButton = document.getElementById('close-new-device');
const pendingDeviceSelect = document.getElementById('pending-device-select');
const findDevicesButton = document.getElementById('find-devices');
const hardwareSections = document.querySelectorAll('.hardware-dependent');
const plantSections = document.querySelectorAll('.plant-dependent');
const deviceRequiredNotice = document.getElementById('device-required-notice');
const projectDeviceStatus = document.getElementById('project-device-status');
const topbarTitle = document.querySelector('.topbar-title');
const topbarSub = document.querySelector('.topbar-sub');
const studentDataStatus = document.getElementById('student-data-status');
const userNameElement = document.querySelector('.user-name');
const registrationKeyInput = document.getElementById('device-registration-key');
const logoutButton = document.getElementById('logout-button');
const storedUser = JSON.parse(localStorage.getItem('rural40_user') || 'null');
const DEFAULT_USER_ID = Number(storedUser?.id) || 0;
let recognizedDevice = null;
let currentProjectId = shell?.dataset.projectId ? Number(shell.dataset.projectId) : null;
let projectRecords = [];
let editingProjectId = null;
let projectFormModal;
let projectsModal;
let currentDashboardView = 'student';
let dailyLogs = [];
let editingLogId = null;
let selectedChallenges = [];
let activeChallenge = null;
const challengeIds = ['color', 'crecer', 'compost', 'riego', 'plagas', 'foto'];
const challengeDetails = {
	color: { title: 'Observa el color', label: 'Color', instruction: 'Usa la lupa y elige el color que más se parece a tus hojas.', action: 'color', fields: ['color', 'observation'] },
	crecer: { title: 'Mide el crecimiento', label: 'Crecimiento', instruction: 'Mide desde la tierra hasta la hoja más alta y escribe tu hallazgo.', action: 'crecer', fields: ['observation'] },
	compost: { title: 'Revisa el compost', label: 'Compost', instruction: 'Mira si está húmedo, huele bien y encuentras lombrices.', action: 'compost', fields: ['observation'] },
	riego: { title: 'Cuida el riego', label: 'Riego', instruction: 'Toca la tierra, aplica agua si está seca y registra cuánto usaste.', action: 'riego', fields: ['water', 'time', 'humidity', 'observation'] },
	plagas: { title: 'Detecta visitantes', label: 'Plagas', instruction: 'Revisa el frente y el reverso de las hojas en busca de bichos o agujeros.', action: 'plagas', fields: ['observation'] },
	foto: { title: 'Captura el avance', label: 'Foto', instruction: 'Toma una foto de tu planta para comparar cómo crece con el tiempo.', action: 'foto', fields: ['photo', 'observation'] },
};

	logoutButton?.addEventListener('click', async () => {
	await fetch('/api/auth/logout', { method: 'POST' });
	localStorage.removeItem('rural40_user');
	window.location.replace('/');
});

if (!DEFAULT_USER_ID) {
	window.location.replace('/');
}

if (storedUser && userNameElement) {
	userNameElement.textContent = `${storedUser.nombres} ${storedUser.apellidos}`.trim();
}

if (storedUser && topbarTitle) {
	topbarTitle.innerHTML = `Hola, ${storedUser.nombres} <span aria-hidden="true">👋</span>`;
}

async function loadRegistrationKey() {
	if (!registrationKeyInput) return;
	try {
		const response = await fetch('/api/config');
		if (!response.ok) throw new Error('No se pudo cargar la clave de registro.');
		const config = await response.json();
		registrationKeyInput.value = config.registrationKey || '';
		if (!registrationKeyInput.value) {
			showDeviceMessage('No se encontró la clave de registro configurada en el servidor.', true);
		}
	} catch (error) {
		showDeviceMessage(error.message, true);
	}
}

function setProjectFormVisible(isVisible) {
	if (projectForm) projectForm.hidden = !isVisible;
	if (addProjectButton) addProjectButton.hidden = false;
}

function closeProjectModal() {
	if (projectFormModal) projectFormModal.hidden = true;
	editingProjectId = null;
}

function openProjectForm(project = null) {
	if (!projectFormModal || !projectForm) return;
	editingProjectId = project?.id || null;
	projectForm.hidden = false;
	projectForm.reset();
	if (project) {
		projectNameInput.value = project.nombre || '';
		projectDescriptionInput.value = project.descripcion || '';
		projectPlantInput.value = String(project.id_planta || '');
		projectTeacherInput.value = String(project.id_docente || '');
	}
	projectForm.querySelector('.save-btn').innerHTML = editingProjectId
		? '<i class="ti ti-device-floppy" aria-hidden="true"></i>Guardar cambios'
		: '<i class="ti ti-plus" aria-hidden="true"></i>Crear proyecto';
	projectFormModal.querySelector('.project-modal-title').textContent = editingProjectId ? 'Editar proyecto' : 'Agregar proyecto';
	projectFormMessage.textContent = '';
	projectFormMessage.style.display = 'none';
	projectFormModal.hidden = false;
}

function renderProjectListModal() {
	if (!projectsModal) return;
	const list = projectsModal.querySelector('.projects-modal-list');
	list.innerHTML = projectRecords.map((project) => {
		const linked = Boolean(project.id_dispositivo);
		return `<article class="project-row"><div><strong>${project.nombre}</strong><span>${project.planta || 'Planta'} · ${project.docente_nombres || ''} ${project.docente_apellidos || ''}</span>${linked ? '<em>Dispositivo vinculado</em>' : ''}</div><div class="project-row-actions"><button class="project-edit-btn" type="button" data-project-action="edit" data-project-id="${project.id}" ${linked ? 'disabled title="No se puede editar con dispositivo vinculado"' : ''}><i class="ti ti-pencil" aria-hidden="true"></i>Editar</button><button class="project-delete-btn" type="button" data-project-action="delete" data-project-id="${project.id}" ${linked ? 'disabled title="No se puede eliminar con dispositivo vinculado"' : ''}><i class="ti ti-trash" aria-hidden="true"></i>Eliminar</button></div></article>`;
	}).join('') || '<p class="projects-empty">No tienes proyectos activos.</p>';
}

function setupProjectModals() {
	if (!projectForm || !projectForm.parentElement) return;
	projectFormModal = document.createElement('div');
	projectFormModal.className = 'project-modal-backdrop';
	projectFormModal.hidden = true;
	projectFormModal.innerHTML = '<section class="project-modal" role="dialog" aria-modal="true"><button class="project-modal-close" type="button" aria-label="Cerrar"><i class="ti ti-x" aria-hidden="true"></i></button><div class="project-modal-title-row"><span class="eyebrow">Gestión de proyectos</span><h2 class="project-modal-title">Agregar proyecto</h2></div></section>';
	projectFormModal.querySelector('.project-modal').append(projectForm);
	document.body.append(projectFormModal);
	projectFormModal.querySelector('.project-modal-close').addEventListener('click', closeProjectModal);
	projectFormModal.addEventListener('click', (event) => { if (event.target === projectFormModal) closeProjectModal(); });

	projectsModal = document.createElement('div');
	projectsModal.className = 'project-modal-backdrop';
	projectsModal.hidden = true;
	projectsModal.innerHTML = '<section class="project-modal project-list-modal" role="dialog" aria-modal="true"><button class="project-modal-close" type="button" aria-label="Cerrar"><i class="ti ti-x" aria-hidden="true"></i></button><div class="project-modal-title-row"><span class="eyebrow">Proyectos activos</span><h2 class="project-modal-title">Ver proyectos</h2></div><div class="projects-modal-list"></div></section>';
	document.body.append(projectsModal);
	projectsModal.querySelector('.project-modal-close').addEventListener('click', () => { projectsModal.hidden = true; });
	projectsModal.addEventListener('click', (event) => { if (event.target === projectsModal) projectsModal.hidden = true; });
	projectsModal.addEventListener('click', async (event) => {
		const button = event.target.closest('[data-project-action]');
		if (!button || button.disabled) return;
		const project = projectRecords.find((item) => Number(item.id) === Number(button.dataset.projectId));
		if (!project) return;
		if (button.dataset.projectAction === 'edit') {
			projectsModal.hidden = true;
			openProjectForm(project);
			return;
		}
		if (button.dataset.projectAction === 'delete' && window.confirm(`¿Eliminar el proyecto "${project.nombre}"?`)) {
			const response = await fetch(`/api/proyectos/${project.id}?usuario_id=${DEFAULT_USER_ID}`, { method: 'DELETE' });
			const result = await response.json();
			if (!response.ok) { window.alert(result.error || 'No fue posible eliminar el proyecto.'); return; }
			projectsModal.hidden = true;
			currentProjectId = null;
			await loadProjects();
		}
	});
}

function setProjectListVisible(isVisible) {
	if (projectList) projectList.hidden = !isVisible;
}

function setProjectNameFallback() {
	if (userNameElement && !storedUser) userNameElement.textContent = 'Usuario';
	if (topbarTitle) {
		topbarTitle.innerHTML = storedUser ? `Hola, ${storedUser.nombres} <span aria-hidden="true">👋</span>` : 'Hola, selecciona un proyecto 👋';
	}
	if (topbarSub) {
		topbarSub.textContent = 'Aún no hay un proyecto activo para este usuario.';
	}
}

function setMetricValues(valueText = 'Sin datos') {
	document.getElementById('m-temp').textContent = valueText;
	document.getElementById('m-hum').textContent = valueText;
	document.getElementById('m-luz').textContent = valueText;
	document.getElementById('m-amb-hum').textContent = valueText;
	if (humiditySlider) humiditySlider.value = 0;
	if (humidityValue) humidityValue.textContent = '0%';
}

function setStudentDataStatus(label, state = 'idle') {
	if (!studentDataStatus) return;
	studentDataStatus.querySelector('span:last-child').textContent = label;
	studentDataStatus.classList.toggle('is-connected', state === 'connected');
	studentDataStatus.classList.toggle('is-pending', state === 'pending');
}

function todayIso() {
	const today = new Date();
	const month = String(today.getMonth() + 1).padStart(2, '0');
	const day = String(today.getDate()).padStart(2, '0');
	return `${today.getFullYear()}-${month}-${day}`;
}

function localDateTimeForDatabase() {
	const now = new Date();
	const pad = (value) => String(value).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function updateDailyLogCareStatus() {
	if (!dailyLogCareStatus) return;
	const hasTodayLog = dailyLogs.some((log) => String(log.fecha_bitacora || '').slice(0, 10) === todayIso());
	dailyLogCareStatus.textContent = hasTodayLog ? 'Completada' : 'Pendiente';
	dailyLogCareStatus.classList.toggle('is-complete', hasTodayLog);
}

function parseChallenges(value) {
	if (Array.isArray(value)) return value.filter((challenge) => challengeIds.includes(challenge));
	try {
		const parsed = JSON.parse(value || '[]');
		return Array.isArray(parsed) ? parsed.filter((challenge) => challengeIds.includes(challenge)) : [];
	} catch {
		return [];
	}
}

function standardizeObservationText(log) {
	if (!log?.observacion) return '';
	const completed = parseChallenges(log.retos_completados);
	return log.observacion.split(' - ').map((note, index) => {
		const trimmedNote = note.trim();
		if (!trimmedNote || trimmedNote.includes(':')) return trimmedNote;
		const challenge = completed[index];
		return challengeDetails[challenge] ? `${challengeDetails[challenge].label}: ${trimmedNote}` : `Observación: ${trimmedNote}`;
	}).filter(Boolean).join(' - ');
}

function formRowFor(selector) {
	return document.querySelector(selector)?.closest('.form-row, .color-fieldset');
}

function getMissionObservation(challenge, log) {
	if (!parseChallenges(log?.retos_completados).includes(challenge)) return '';
	const standardizedObservation = standardizeObservationText(log);
	if (!standardizedObservation) return '';
	const label = challengeDetails[challenge]?.label;
	const labeledNote = standardizedObservation.split(' - ').find((note) => note.trim().startsWith(`${label}:`));
	return labeledNote ? labeledNote.trim().slice(label.length + 1).trim() : standardizedObservation;
}

function configureMissionForm(challenge, log, readOnly) {
	const fields = challengeDetails[challenge]?.fields || [];
	const rows = {
		temp: formRowFor('#inp-temp'),
		water: formRowFor('#water-amount'),
		time: formRowFor('#watering-time'),
		humidity: formRowFor('#sl-hum'),
		color: formRowFor('.color-fieldset'),
		observation: formRowFor('#observation'),
		photo: formRowFor('#daily-photo'),
	};
	Object.entries(rows).forEach(([name, row]) => row?.classList.toggle('quest-hidden', !fields.includes(name)));
	document.getElementById('observation').placeholder = challenge === 'crecer' ? 'Ej: mide 12 cm y tiene una hoja nueva...' : 'Ej: la tierra estaba húmeda...';
	const requiredFields = ['water-amount', 'watering-time'].map((id) => document.getElementById(id));
	requiredFields.forEach((field) => { field.required = challenge === 'riego'; });
	document.getElementById('inp-temp').required = false;
	document.getElementById('observation').required = fields.includes('observation');
	if (!fields.includes('photo') && dailyPhoto) dailyPhoto.value = '';
	document.getElementById('observation').value = getMissionObservation(challenge, log);
	if (challenge === 'riego' && log) {
		document.getElementById('water-amount').value = log.agua_aplicada_ml ?? '';
		document.getElementById('watering-time').value = log.hora_riego || '';
		humiditySlider.value = log.humedad_suelo_pct ?? 68;
		humidityValue.textContent = `${humiditySlider.value}%`;
	}
	if (challenge === 'color' && log?.color_hojas) {
		colorButtons.forEach((button) => {
			const selected = button.dataset.color === log.color_hojas;
			button.classList.toggle('selected', selected);
			button.setAttribute('aria-pressed', String(selected));
		});
	}
	plantForm.querySelectorAll('input, textarea, select, .color-btn').forEach((control) => {
		control.disabled = readOnly;
	});
}

function openQuestModal(challenge) {
	const detail = challengeDetails[challenge];
	if (!detail || !questModal) return;
	activeChallenge = challenge;
	const currentLog = dailyLogs.find((log) => String(log.fecha_bitacora || '').slice(0, 10) === (dailyLogDate.value || todayIso()));
	const readOnly = selectedChallenges.includes(challenge);
	questModalTitle.textContent = detail.title;
	questModalInstruction.textContent = detail.instruction;
	questScene.dataset.action = detail.action;
	configureMissionForm(challenge, currentLog, readOnly);
	questComplete.hidden = readOnly;
	questCompletedNote.hidden = !readOnly;
	questModal.hidden = false;
	questModalClose.focus();
}

function closeQuestModal() {
	if (!questModal) return;
	questModal.hidden = true;
	activeChallenge = null;
}

function updateQuestPanel(challenges = []) {
	selectedChallenges = [...new Set(parseChallenges(challenges))];
	const completedToday = selectedChallenges.length;
	questItems.forEach((item) => {
		const completed = selectedChallenges.includes(item.dataset.challenge);
		item.classList.toggle('is-complete', completed);
		item.setAttribute('aria-pressed', String(completed));
		const reward = item.querySelector('em');
		if (reward) reward.textContent = completed ? 'Completado' : '+10 XP';
	});
	if (questProgressFill) questProgressFill.style.width = `${completedToday / challengeIds.length * 100}%`;
	if (questProgressLabel) questProgressLabel.textContent = `${completedToday}/6 objetivos`;
	if (questMessage) questMessage.textContent = completedToday === challengeIds.length ? 'Misión completa. Guarda tu registro para conservar el XP.' : 'Abre una misión para registrar el hallazgo y ganar XP.';
	const totalXp = dailyLogs.reduce((sum, log) => sum + parseChallenges(log.retos_completados).length * 10, 0);
	if (questLevel) questLevel.textContent = `Nivel ${Math.floor(totalXp / 50) + 1} · ${totalXp} XP`;
}

function renderDailyLogs() {
	if (!dailyLogsList) return;
	if (!dailyLogs.length) {
		dailyLogsList.innerHTML = '<article class="card empty-view-card"><i class="ti ti-chart-line" aria-hidden="true"></i><h3>Sin registros todavía</h3><p class="card-help">Guarda tu primera bitácora desde “Mi planta”.</p></article>';
		return;
	}
	dailyLogsList.innerHTML = dailyLogs.map((log) => {
		const completedChallenges = parseChallenges(log.retos_completados);
		return `<article class="card daily-log-card"><div class="daily-log-header"><div><span class="eyebrow">${log.fecha_bitacora}</span><h3>${standardizeObservationText(log) || 'Bitácora diaria'}</h3></div><div class="daily-log-actions"><span class="log-xp"><i class="ti ti-trophy" aria-hidden="true"></i>${completedChallenges.length * 10} XP</span><button type="button" data-log-action="edit" data-log-id="${log.id}"><i class="ti ti-pencil" aria-hidden="true"></i>Editar</button><button type="button" data-log-action="delete" data-log-id="${log.id}"><i class="ti ti-trash" aria-hidden="true"></i>Eliminar</button></div></div><div class="daily-log-values"><span><i class="ti ti-target" aria-hidden="true"></i>${completedChallenges.length}/6 objetivos</span><span><i class="ti ti-temperature" aria-hidden="true"></i>${log.temperatura_ambiente_c ?? 'Sin dato'} °C</span><span><i class="ti ti-droplet" aria-hidden="true"></i>${log.humedad_suelo_pct ?? 'Sin dato'}%</span><span><i class="ti ti-droplet-filled" aria-hidden="true"></i>${log.agua_aplicada_ml ?? 'Sin dato'} ml</span><span><i class="ti ti-clock" aria-hidden="true"></i>${log.hora_riego || 'Sin hora'}</span></div></article>`;
	}).join('');
}

async function loadDailyLogs() {
	if (!currentProjectId || !dailyLogsList) return;
	const response = await fetch(`/api/monitoreo/bitacoras?id_proyecto=${currentProjectId}&id_usuario=${DEFAULT_USER_ID}`);
	if (!response.ok) return;
	dailyLogs = await response.json();
	updateDailyLogCareStatus();
	renderDailyLogs();
	const todayLog = dailyLogs.find((log) => String(log.fecha_bitacora || '').slice(0, 10) === todayIso());
	updateQuestPanel(todayLog?.retos_completados || []);
}

async function loadPhotoAlbum() {
	if (!currentProjectId || !photoAlbum) return;
	const response = await fetch(`/api/monitoreo/fotografias?id_proyecto=${currentProjectId}&id_usuario=${DEFAULT_USER_ID}`);
	if (!response.ok) return;
	const photos = await response.json();
	if (!photos.length) {
		photoAlbum.innerHTML = '<article class="card empty-view-card"><i class="ti ti-camera-plus" aria-hidden="true"></i><h3>Agrega tu primera foto</h3><p class="card-help">Puedes subirla desde la bitácora diaria en “Mi planta”.</p></article>';
		return;
	}
	const grouped = photos.reduce((groups, photo) => { const day = photo.fecha_fotografia.slice(0, 10); (groups[day] ||= []).push(photo); return groups; }, {});
	photoAlbum.innerHTML = Object.entries(grouped).map(([day, items]) => `<section class="photo-day"><div class="photo-day-heading"><span class="eyebrow">${day}</span><strong>${items.length} foto${items.length === 1 ? '' : 's'}</strong></div><div class="photo-grid">${items.map((photo) => `<figure><img src="${photo.url}" alt="Registro fotográfico del ${day}" loading="lazy"><figcaption>${new Date(photo.fecha_fotografia).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</figcaption></figure>`).join('')}</div></section>`).join('');
}

function formatMetricValue(value, suffix = '') {
	if (value === null || value === undefined || value === '') {
		return 'Sin datos';
	}
	const numberValue = Number(value);
	if (Number.isNaN(numberValue)) {
		return 'Sin datos';
	}
	return `${numberValue.toFixed(1)}${suffix}`;
}

function setHardwareAvailability(isAvailable, label = 'Dispositivo pendiente') {
	hardwareSections.forEach((section) => {
		section.hidden = currentDashboardView !== 'plant' || !currentProjectId || !isAvailable;
	});
	plantSections.forEach((section) => {
		section.hidden = currentDashboardView !== 'plant' || !currentProjectId;
	});
	if (!currentProjectId) {
		setStudentDataStatus('Sin datos');
		deviceRequiredNotice.hidden = false;
		deviceStatus.textContent = 'Sin vincular';
		projectDeviceStatus.innerHTML = '<i class="ti ti-circle-off" aria-hidden="true"></i>Sin proyecto';
		return;
	}
	deviceRequiredNotice.hidden = isAvailable;
	if (!isAvailable) setStudentDataStatus('Dispositivo pendiente', 'pending');
	if (isAvailable) {
		setStudentDataStatus('Dispositivo conectado', 'pending');
		deviceStatus.textContent = 'Vinculado';
		projectDeviceStatus.innerHTML = '<i class="ti ti-circle-check" aria-hidden="true"></i>Dispositivo vinculado';
	} else {
		deviceStatus.textContent = 'Sin vincular';
		projectDeviceStatus.innerHTML = `<i class="ti ti-device-sd-card" aria-hidden="true"></i>${label}`;
	}
}

function setDeviceFormAvailability(isAvailable, project = null) {
	if (!deviceForm) return;
	const isLinked = Boolean(project && project.id_dispositivo);
	deviceForm.hidden = isLinked || !isAvailable;
	if (deviceLinkedSummary) {
		deviceLinkedSummary.hidden = !isLinked;
		if (isLinked && project) {
			if (linkedDeviceCode) linkedDeviceCode.textContent = project.codigo_interno || 'Sin código';
			if (linkedDeviceConfig) {
				linkedDeviceConfig.textContent = `Luz: ${project.configuracion_led || 'no definida'} · Color: ${project.color_led || 'rojo'} · Tierra: ${project.tipo_tierra || 'Sin definir'}`;
			}
		}
	}
	if (!isAvailable && deviceMessage) {
		deviceMessage.textContent = 'Selecciona un proyecto activo para registrar y vincular un dispositivo.';
		deviceMessage.style.display = 'block';
	}
}

function showProjectMessage(message, isError = true) {
	projectFormMessage.textContent = message;
	projectFormMessage.style.display = 'block';
	projectFormMessage.style.color = isError ? '#a33f32' : '#3b6d11';
}

function setEmptyProjectState() {
	dailyLogs = [];
	updateDailyLogCareStatus();
	if (projectBannerTitle) projectBannerTitle.textContent = 'No hay proyecto activo';
	if (projectBannerSubtitle) projectBannerSubtitle.textContent = 'Crear un proyecto para ver la información del monitoreo.';
	if (projectSelect) projectSelect.innerHTML = '<option value="">Sin proyectos</option>';
	if (projectTeacherInput) projectTeacherInput.value = '';
	setProjectListVisible(false);
	setProjectFormVisible(true);
	if (showProjectsButton) showProjectsButton.hidden = true;
	setProjectNameFallback();
	setMetricValues('Sin datos');
	setHardwareAvailability(false, 'Dispositivo pendiente');
	setDeviceFormAvailability(false);
}

async function loadTeachers() {
	if (!projectTeacherInput) return;
	try {
		const response = await fetch('/api/proyectos/docentes');
		if (!response.ok) throw new Error('No se pudieron cargar los docentes.');
		const teachers = await response.json();
		if (!Array.isArray(teachers) || !teachers.length) {
			projectTeacherInput.innerHTML = '<option value="">No hay docentes disponibles</option>';
			return;
		}
		projectTeacherInput.innerHTML = teachers
			.map((teacher) => `<option value="${teacher.id}">${teacher.nombres} ${teacher.apellidos}</option>`)
			.join('');
		projectTeacherInput.insertAdjacentHTML('afterend', '');
	} catch (error) {
		projectTeacherInput.innerHTML = '<option value="">No hay docentes disponibles</option>';
	}
}

function setActiveProject(projectId) {
	currentProjectId = projectId ? Number(projectId) : null;
	shell.dataset.projectId = currentProjectId ? String(currentProjectId) : '';
	dailyLogs = [];
	editingLogId = null;
	selectedChallenges = [];
	updateQuestPanel([]);
	resetDailyLogForm();
	if (projectSelect && currentProjectId) {
		projectSelect.value = String(currentProjectId);
	}
	loadProjectDeviceStatus();
	loadDailyLogs();
	loadPhotoAlbum();
}

async function loadPlantCatalog() {
	if (!projectPlantInput) return;
	try {
		const response = await fetch('/api/proyectos/plantas');
		if (!response.ok) throw new Error('No se pudieron cargar las plantas.');
		const plants = await response.json();
		if (!Array.isArray(plants) || !plants.length) {
			projectPlantInput.innerHTML = '<option value="">Sin plantas disponibles</option>';
			return;
		}
		projectPlantInput.innerHTML = plants
			.map((plant) => `<option value="${plant.id}">${plant.nombre_comun}</option>`)
			.join('');
	} catch (error) {
		projectPlantInput.innerHTML = '<option value="">Sin plantas disponibles</option>';
	}
}

async function loadProjects() {
	if (!projectSelect) return;
	projectSelect.innerHTML = '<option value="">Cargando...</option>';
	try {
		const response = await fetch(`/api/proyectos?usuario_id=${DEFAULT_USER_ID}`);
		if (!response.ok) {
			throw new Error('No fue posible consultar los proyectos del usuario.');
		}
		const projects = await response.json();
		projectRecords = Array.isArray(projects) ? projects : [];
		if (!projects.length) {
			setEmptyProjectState();
			return;
		}
		projectSelect.innerHTML = projects.map((project) => `<option value="${project.id}">${project.nombre}</option>`).join('');
		setProjectFormVisible(false);
		setProjectListVisible(true);
		if (showProjectsButton) showProjectsButton.hidden = false;
		const selectedProjectId = currentProjectId || projects[0].id;
		setActiveProject(selectedProjectId);
	} catch (error) {
		setEmptyProjectState();
		showProjectMessage(error.message, true);
	}
}

async function createProject(event) {
	event.preventDefault();
	const payload = {
		id_usuario: DEFAULT_USER_ID,
		id_docente: Number(projectTeacherInput.value),
		id_planta: Number(projectPlantInput.value),
		nombre: projectNameInput.value.trim(),
		descripcion: projectDescriptionInput.value.trim(),
		fecha_inicio: new Date().toISOString().slice(0, 10),
	};

	if (!payload.nombre || !payload.id_planta || !payload.id_docente) {
		showProjectMessage('Completa el nombre del proyecto, elige la planta y el docente.', true);
		return;
	}

	try {
		const response = await fetch(editingProjectId ? `/api/proyectos/${editingProjectId}` : '/api/proyectos', {
			method: editingProjectId ? 'PUT' : 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.error || 'No fue posible crear el proyecto.');
		projectNameInput.value = '';
		projectDescriptionInput.value = '';
		showProjectMessage(editingProjectId ? 'Proyecto actualizado correctamente.' : `Proyecto creado correctamente: ${result.nombre}`, false);
		closeProjectModal();
		await loadProjects();
		setActiveProject(result.id);
		setProjectListVisible(true);
		if (showProjectsButton) showProjectsButton.hidden = false;
	} catch (error) {
		showProjectMessage(error.message, true);
	}
}

if (projectForm) projectForm.addEventListener('submit', createProject);
if (addProjectButton) {
	addProjectButton.addEventListener('click', () => {
		openProjectForm();
	});
}
if (showProjectsButton) {
	showProjectsButton.addEventListener('click', () => {
		renderProjectListModal();
		projectsModal.hidden = false;
	});
}
if (projectSelect) {
	projectSelect.addEventListener('change', (event) => {
		const nextProjectId = event.target.value;
		if (!nextProjectId) {
			currentProjectId = null;
			shell.dataset.projectId = '';
			setEmptyProjectState();
			return;
		}
		setProjectListVisible(true);
		setActiveProject(nextProjectId);
	});
}

function renderProjectSummary(summary) {
	if (!summary || !summary.project) {
		setEmptyProjectState();
		return;
	}

	const project = summary.project;
	const reading = summary.ultima_lectura || null;
	const fullUserName = [project.usuario?.nombres, project.usuario?.apellidos].filter(Boolean).join(' ') || 'Usuario';
	const institutionName = project.institucion || 'Institución no registrada';

	if (userNameElement) userNameElement.textContent = fullUserName;
	if (topbarTitle) topbarTitle.textContent = `Hola, ${fullUserName} 👋`;
	if (topbarSub) topbarSub.textContent = `Proyecto: ${project.nombre} · ${institutionName}`;
	if (projectBannerTitle) projectBannerTitle.textContent = project.nombre || 'Proyecto sin nombre';
	if (projectBannerSubtitle) projectBannerSubtitle.textContent = `${project.planta || 'Planta'} · ${institutionName} · ${fullUserName}`;
	const teacherName = project.docente ? [project.docente.nombres, project.docente.apellidos].filter(Boolean).join(' ') : 'Docente sin asignar';
	if (projectBannerSubtitle) projectBannerSubtitle.textContent = `${project.planta || 'Planta'} · ${institutionName} · ${teacherName}`;

	if (reading) {
		setStudentDataStatus('Datos en vivo', 'connected');
		document.getElementById('m-temp').textContent = formatMetricValue(reading.temperatura_c, '°');
		document.getElementById('m-hum').textContent = formatMetricValue(reading.humedad_suelo_pct, '%');
		document.getElementById('m-luz').textContent = formatMetricValue(reading.intensidad_luz_lux, ' lx');
		document.getElementById('m-amb-hum').textContent = formatMetricValue(reading.humedad_ambiente_pct, '%');
		if (humiditySlider) humiditySlider.value = Number(reading.humedad_suelo_pct || 0);
		if (humidityValue) humidityValue.textContent = `${humiditySlider.value}%`;
	} else {
		setStudentDataStatus(project.id_dispositivo ? 'Dispositivo conectado' : 'Sin datos', project.id_dispositivo ? 'pending' : 'idle');
		setMetricValues('Sin datos');
	}

	setHardwareAvailability(Boolean(project.id_dispositivo), project.id_dispositivo ? 'Dispositivo vinculado' : 'Dispositivo pendiente');
	setDeviceFormAvailability(Boolean(currentProjectId) && !project.id_dispositivo, project);
}

async function loadProjectDeviceStatus() {
	if (!currentProjectId) {
		setEmptyProjectState();
		return;
	}

	try {
		const response = await fetch(`/api/proyectos/resumen/${currentProjectId}`);
		if (!response.ok) {
			throw new Error('No se pudo consultar el resumen del proyecto.');
		}
		const summary = await response.json();
		renderProjectSummary(summary);
	} catch (error) {
		setEmptyProjectState();
	}
}

setupProjectModals();
setEmptyProjectState();
loadRegistrationKey();
loadPlantCatalog();
loadTeachers();
loadProjects();

function setDashboardView(view) {
	currentDashboardView = view;
	dashboardViews.forEach((section) => {
		section.hidden = section.dataset.dashboardView !== view;
	});
	if (topbarSub && view !== 'student') {
		topbarSub.textContent = navigationItems ? [...navigationItems].find((item) => item.dataset.view === view)?.textContent.trim() || '' : '';
	}
	setHardwareAvailability(Boolean(currentProjectId));
	if (view === 'student' || view === 'plant') loadProjectDeviceStatus();
	if (view === 'records') loadDailyLogs();
	if (view === 'photos') loadPhotoAlbum();
}

navigationItems.forEach((item) => {
	item.addEventListener('click', () => {
		const selectedView = item.dataset.view || 'student';
		navigationItems.forEach((navItem) => navItem.classList.remove('active'));
		item.classList.add('active');
		setDashboardView(selectedView);
	});
});

setDashboardView('student');

colorButtons.forEach((button) => {
	button.addEventListener('click', () => {
		colorButtons.forEach((colorButton) => {
			colorButton.classList.remove('selected');
			colorButton.setAttribute('aria-pressed', 'false');
		});
		button.classList.add('selected');
		button.setAttribute('aria-pressed', 'true');
	});
});

if (humiditySlider) {
	humiditySlider.addEventListener('input', () => {
		humidityValue.textContent = `${humiditySlider.value}%`;
	});
}

function setNewDeviceModalVisible(isVisible) {
	if (!newDeviceModal) return;
	newDeviceModal.hidden = !isVisible;
	if (isVisible) closeNewDeviceButton?.focus();
}

if (newDeviceButton) newDeviceButton.addEventListener('click', () => setNewDeviceModalVisible(true));
if (closeNewDeviceButton) closeNewDeviceButton.addEventListener('click', () => setNewDeviceModalVisible(false));
if (newDeviceModal) {
	newDeviceModal.addEventListener('click', (event) => {
		if (event.target === newDeviceModal) setNewDeviceModalVisible(false);
	});
}
document.addEventListener('keydown', (event) => {
	if (event.key === 'Escape' && newDeviceModal && !newDeviceModal.hidden) setNewDeviceModalVisible(false);
});

function showDeviceMessage(message, isError = true) {
	deviceMessage.textContent = message;
	deviceMessage.style.display = 'block';
	deviceMessage.style.color = isError ? '' : '#3b6d11';
}

async function loadPendingDevices() {
	const registrationKey = document.getElementById('device-registration-key')?.value.trim();
	if (!registrationKey || !pendingDeviceSelect) {
		showDeviceMessage('Escribe la clave de registro para buscar dispositivos provisionados.');
		return;
	}
	try {
		const response = await fetch('/api/dispositivos/pendientes', { headers: { 'X-Registration-Key': registrationKey } });
		const devices = await response.json();
		if (!response.ok) throw new Error(devices.error || 'No fue posible consultar los dispositivos.');
		pendingDeviceSelect.innerHTML = devices.length
			? '<option value="">Selecciona un dispositivo</option>' + devices.map((device) => `<option value="${device.id}" data-code="${device.codigo_interno}" data-mac="${device.mac_address || ''}" data-serial="${device.serial || ''}" data-link="${device.codigo_vinculacion || ''}">${device.codigo_interno} · ${device.mac_address || device.serial || 'sin identificador'}</option>`).join('')
			: '<option value="">No hay dispositivos pendientes</option>';
		showDeviceMessage(`${devices.length} dispositivo(s) pendiente(s) encontrado(s).`, false);
	} catch (error) {
		showDeviceMessage(error.message);
	}
}

if (findDevicesButton) findDevicesButton.addEventListener('click', loadPendingDevices);
if (pendingDeviceSelect) {
	pendingDeviceSelect.addEventListener('change', () => {
		const option = pendingDeviceSelect.selectedOptions[0];
		if (!option?.dataset.code) return;
		document.getElementById('device-code').value = option.dataset.code;
		document.getElementById('device-mac').value = option.dataset.mac;
		document.getElementById('device-serial').value = option.dataset.serial;
		recognizedDevice = { codigo_vinculacion: option.dataset.link };
		linkDeviceButton.disabled = !recognizedDevice.codigo_vinculacion;
		showDeviceMessage('Dispositivo seleccionado. Puedes vincularlo al proyecto.', false);
	});
}

function getSelectedLeafColor() {
	return document.querySelector('.color-btn.selected')?.dataset.color || null;
}

function resetDailyLogForm() {
	if (!plantForm) return;
	plantForm.reset();
	if (dailyLogDate) dailyLogDate.value = todayIso();
	if (humiditySlider) humiditySlider.value = 68;
	if (humidityValue) humidityValue.textContent = '68%';
	colorButtons.forEach((button, index) => {
		const selected = index === 0;
		button.classList.toggle('selected', selected);
		button.setAttribute('aria-pressed', String(selected));
	});
	editingLogId = null;
}

if (registerDeviceButton) {
	registerDeviceButton.addEventListener('click', async () => {
		const registrationKey = document.getElementById('device-registration-key').value;
		const payload = {
			codigo_interno: document.getElementById('device-code').value,
			mac_address: document.getElementById('device-mac').value,
			serial: document.getElementById('device-serial').value,
		};

		if (!payload.codigo_interno || (!payload.mac_address && !payload.serial) || !registrationKey) {
			showDeviceMessage('Completa el código interno, la MAC o serial y la clave de registro.');
			return;
		}

		registerDeviceButton.disabled = true;
		showDeviceMessage('Reconociendo dispositivo...', false);
		try {
			const response = await fetch('/api/dispositivos/registrar', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Registration-Key': registrationKey,
				},
				body: JSON.stringify(payload),
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'No fue posible reconocer el ESP32.');

			recognizedDevice = result;
			linkDeviceButton.disabled = false;
			deviceStatus.textContent = 'Reconocido';
			deviceStatus.classList.add('status-saludable');
			deviceLinkCode.hidden = false;
			deviceLinkCode.textContent = `Código de vinculación: ${result.codigo_vinculacion}`;
			deviceApiKey.hidden = false;
			deviceApiKey.textContent = `API key para el ESP32: ${result.api_key}`;
			showDeviceMessage('ESP32 reconocido. Ahora puedes vincularlo al proyecto.', false);
		} catch (error) {
			showDeviceMessage(error.message);
		} finally {
			registerDeviceButton.disabled = false;
		}
	});
}

if (deviceForm) {
	deviceForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (!recognizedDevice) {
			showDeviceMessage('Primero reconoce el ESP32.');
			return;
		}

		if (!currentProjectId) {
			showDeviceMessage('Primero crea o selecciona un proyecto activo.');
			return;
		}

		try {
			const response = await fetch(`/api/dispositivos/proyectos/${currentProjectId}/vincular`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Registration-Key': document.getElementById('device-registration-key').value,
				},
				body: JSON.stringify({
					codigo_interno: document.getElementById('device-code').value,
					codigo_vinculacion: recognizedDevice.codigo_vinculacion,
					configuracion_led: ledLight.value,
					color_led: ledColor.value,
					brillo_led: { suave: 64, media: 128, intensa: 192, maxima: 255 }[ledLight.value],
					tipo_tierra: soilType.value,
				}),
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'No fue posible vincular el dispositivo.');

			deviceStatus.textContent = 'Vinculado';
			setHardwareAvailability(true);
			deviceForm.hidden = true;
			deviceLinkCode.hidden = true;
			linkDeviceButton.disabled = true;
			showDeviceMessage('Dispositivo y configuración guardados correctamente.', false);
			await loadProjects();
		} catch (error) {
			showDeviceMessage(error.message);
		}
	});
}

if (unlinkDeviceButton) {
	unlinkDeviceButton.addEventListener('click', async () => {
		if (!currentProjectId) return;
		try {
			const response = await fetch(`/api/dispositivos/proyectos/${currentProjectId}`, {
				method: 'DELETE',
				headers: {
					'X-Registration-Key': document.getElementById('device-registration-key').value,
				},
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'No fue posible eliminar la vinculación.');
			showDeviceMessage('Dispositivo desvinculado correctamente.', false);
			recognizedDevice = null;
			await loadProjects();
		} catch (error) {
			showDeviceMessage(error.message);
		}
	});
}

if (plantForm) {
	if (dailyLogDate) dailyLogDate.value = todayIso();
	if (questModalForm) questModalForm.append(plantForm);
	questItems.forEach((item) => item.addEventListener('click', () => openQuestModal(item.dataset.challenge)));
	questModalClose?.addEventListener('click', closeQuestModal);
	questModalCancel?.addEventListener('click', closeQuestModal);
	questModal?.addEventListener('click', (event) => { if (event.target === questModal) closeQuestModal(); });
	questComplete?.addEventListener('click', () => {
		if (!activeChallenge) return;
		if (!selectedChallenges.includes(activeChallenge)) selectedChallenges = [...selectedChallenges, activeChallenge];
		plantForm.requestSubmit();
	});
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && questModal && !questModal.hidden) closeQuestModal();
	});
	dailyLogsList?.addEventListener('click', async (event) => {
		const button = event.target.closest('[data-log-action]');
		if (!button) return;
		const log = dailyLogs.find((item) => Number(item.id) === Number(button.dataset.logId));
		if (!log) return;
		if (button.dataset.logAction === 'delete') {
			if (!window.confirm(`¿Eliminar la bitácora del ${log.fecha_bitacora}?`)) return;
			const response = await fetch(`/api/monitoreo/bitacoras/${log.id}?id_proyecto=${currentProjectId}&id_usuario=${DEFAULT_USER_ID}`, { method: 'DELETE' });
			if (response.ok) { await loadDailyLogs(); return; }
			window.alert('No fue posible eliminar la bitácora.');
			return;
		}
		editingLogId = log.id;
		dailyLogDate.value = log.fecha_bitacora;
		document.getElementById('inp-temp').value = log.temperatura_ambiente_c || '';
		document.getElementById('water-amount').value = log.agua_aplicada_ml || '';
		document.getElementById('watering-time').value = log.hora_riego || '';
		humiditySlider.value = log.humedad_suelo_pct || 0;
		humidityValue.textContent = `${humiditySlider.value}%`;
		document.getElementById('observation').value = log.observacion || '';
		updateQuestPanel(log.retos_completados || []);
		activeChallenge = parseChallenges(log.retos_completados)[0] || 'color';
		document.querySelector('[data-view="plant"]')?.click();
		openQuestModal(activeChallenge);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	});

	plantForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		const temperature = document.getElementById('inp-temp').value;
		formError.style.display = 'none';
		if (temperature) document.getElementById('m-temp').textContent = `${Number.parseFloat(temperature).toFixed(1)}°`;
		document.getElementById('m-hum').textContent = `${humiditySlider.value}%`;
		const waterAmount = document.getElementById('water-amount').value;
		const wateringTime = document.getElementById('watering-time').value;
		if (activeChallenge === 'riego' && (!waterAmount || !wateringTime)) {
			formError.textContent = 'Indica cuánta agua aplicaste y a qué hora.';
			formError.style.display = 'block';
			return;
		}
		if (activeChallenge === 'foto' && !dailyPhoto?.files?.[0]) {
			formError.textContent = 'Agrega una foto para completar esta misión.';
			formError.style.display = 'block';
			return;
		}
		if (!currentProjectId) {
			formError.textContent = 'Selecciona un proyecto activo antes de guardar la bitácora.';
			formError.style.display = 'block';
			return;
		}
		const hasPhoto = Boolean(dailyPhoto?.files?.[0]);
		const payloadDate = dailyLogDate.value || todayIso();
		const currentLog = dailyLogs.find((log) => String(log.fecha_bitacora || '').slice(0, 10) === payloadDate);
		const logId = editingLogId || currentLog?.id || null;
		const completedChallenges = [...new Set([...parseChallenges(currentLog?.retos_completados), ...selectedChallenges, activeChallenge].filter(Boolean))];
		const missionObservation = document.getElementById('observation').value.trim();
		const standardizedCurrentObservation = standardizeObservationText(currentLog);
		const previousObservations = standardizedCurrentObservation ? standardizedCurrentObservation.split(' - ').map((note) => note.trim()).filter(Boolean) : [];
		const detail = challengeDetails[activeChallenge];
		const labeledObservation = missionObservation && detail ? `${detail.label}: ${missionObservation}` : '';
		const observations = labeledObservation && !previousObservations.includes(labeledObservation)
			? [...previousObservations, labeledObservation]
			: previousObservations;

		try {
			const payload = {
				id_proyecto: currentProjectId,
				id_usuario: DEFAULT_USER_ID,
				fecha_bitacora: payloadDate,
				temperatura_ambiente_c: temperature ? Number(temperature) : currentLog?.temperatura_ambiente_c ?? null,
				agua_aplicada_ml: activeChallenge === 'riego' ? Number(waterAmount) : currentLog?.agua_aplicada_ml ?? null,
				hora_riego: activeChallenge === 'riego' ? wateringTime : currentLog?.hora_riego || null,
				humedad_suelo_pct: activeChallenge === 'riego' ? Number(humiditySlider.value) : currentLog?.humedad_suelo_pct ?? Number(humiditySlider.value),
				color_hojas: activeChallenge === 'color' ? getSelectedLeafColor() : currentLog?.color_hojas || getSelectedLeafColor(),
				observacion: observations.join(' - '),
				retos_completados: completedChallenges,
			};
			const response = await fetch(logId ? `/api/monitoreo/bitacoras/${logId}` : '/api/monitoreo/bitacoras', {
				method: logId ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'No fue posible guardar la bitácora.');
			let photoWarning = '';
			if (hasPhoto) {
				const photoData = new FormData();
				photoData.append('foto', dailyPhoto.files[0]);
				photoData.append('id_proyecto', currentProjectId);
				photoData.append('id_usuario', DEFAULT_USER_ID);
				photoData.append('fecha_bitacora', payload.fecha_bitacora);
				photoData.append('fecha_fotografia', localDateTimeForDatabase());
				const photoResponse = await fetch('/api/monitoreo/fotografias', { method: 'POST', body: photoData });
				if (!photoResponse.ok) photoWarning = ' La bitácora se guardó, pero no fue posible guardar la foto.';
			}
			resetDailyLogForm();
			await loadDailyLogs();
			await loadPhotoAlbum();
			formError.textContent = `${hasPhoto ? 'Bitácora y foto' : 'Bitácora'} guardadas correctamente.${photoWarning}`;
		} catch (error) {
			formError.textContent = error.message;
			formError.style.display = 'block';
			return;
		}
		formError.textContent += ' El formulario está listo para otro día.';
		formError.style.color = '#3b6d11';
		formError.style.display = 'block';
		saveButton.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i>Guardado';
		saveButton.style.background = '#27500a';
		closeQuestModal();

		window.setTimeout(() => {
			saveButton.innerHTML = '<i class="ti ti-device-floppy" aria-hidden="true"></i>Guardar registro';
			saveButton.style.background = '';
			formError.style.display = 'none';
			formError.style.color = '';
		}, 2000);
	});
}

