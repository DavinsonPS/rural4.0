import { cachedUser, requireUser, logout } from '../lib/sesion.js';
import { fullName } from './formato.js';
import { initPanel, loadPanel } from './panel.js';
import { showProject } from './proyecto.js';
import { showQuizList, showQuizEditor, showQuizResults } from './cuestionarios.js';

const views = {
	panel: document.getElementById('view-panel'),
	project: document.getElementById('view-project'),
	quizzes: document.getElementById('view-quizzes'),
};
const navItems = document.querySelectorAll('[data-nav]');

function greet(user) {
	if (!user) return;
	document.getElementById('teacher-name').textContent = user.nombres || 'docente';
	document.getElementById('teacher-full-name').textContent = fullName(user) || 'Docente';
	document.getElementById('teacher-initial').textContent = (user.nombres || 'D').charAt(0).toUpperCase();
	if (user.institucion) document.getElementById('teacher-institution').textContent = `${user.institucion} · Seguimiento de los proyectos de tus estudiantes.`;
}

function show(viewName, navName) {
	Object.entries(views).forEach(([name, element]) => { element.hidden = name !== viewName; });
	navItems.forEach((item) => item.classList.toggle('active', item.dataset.nav === navName));
	window.scrollTo({ top: 0 });
}

// Navegación por hash, para que atrás/adelante del navegador funcionen:
// #panel · #proyecto/<id> · #cuestionarios · #cuestionario/nuevo · #cuestionario/<id> · #cuestionario/<id>/editar
function route() {
	const hash = window.location.hash;
	let match;
	if ((match = hash.match(/^#proyecto\/(\d+)$/))) {
		show('project', 'panel');
		showProject(Number(match[1]));
	} else if (hash === '#cuestionarios') {
		show('quizzes', 'cuestionarios');
		showQuizList();
	} else if (hash === '#cuestionario/nuevo') {
		show('quizzes', 'cuestionarios');
		showQuizEditor(null);
	} else if ((match = hash.match(/^#cuestionario\/(\d+)\/editar$/))) {
		show('quizzes', 'cuestionarios');
		showQuizEditor(Number(match[1]));
	} else if ((match = hash.match(/^#cuestionario\/(\d+)$/))) {
		show('quizzes', 'cuestionarios');
		showQuizResults(Number(match[1]));
	} else {
		show('panel', 'panel');
		loadPanel();
	}
}

document.getElementById('logout-button').addEventListener('click', logout);
greet(cachedUser());

requireUser(['DOCENTE', 'ADMINISTRADOR']).then((user) => {
	greet(user);
	document.getElementById('admin-link').hidden = user.rol !== 'ADMINISTRADOR';
	initPanel();
	window.addEventListener('hashchange', route);
	route();
}).catch(() => {});
