import { cachedUser, requireUser, logout } from '../lib/sesion.js';
import { showOverview } from './resumen.js';
import { showUsers } from './usuarios.js';
import { showInstitutions, showPlants } from './catalogos.js';
import { showDevices } from './dispositivos.js';
import { showAudit } from './auditoria.js';

const routes = {
	resumen: showOverview,
	usuarios: showUsers,
	instituciones: showInstitutions,
	plantas: showPlants,
	dispositivos: showDevices,
	auditoria: showAudit,
};

let currentUser = null;

function greet(user) {
	if (!user) return;
	document.getElementById('admin-name').textContent = user.nombres || 'administrador';
	document.getElementById('admin-full-name').textContent = `${user.nombres || ''} ${user.apellidos || ''}`.trim() || 'Administrador';
	document.getElementById('admin-initial').textContent = (user.nombres || 'A').charAt(0).toUpperCase();
}

// Navegación por hash: #resumen, #usuarios, #instituciones, #plantas, #dispositivos, #auditoria.
function route() {
	const name = window.location.hash.replace('#', '') || 'resumen';
	const show = routes[name] || routes.resumen;
	document.querySelectorAll('[data-nav]').forEach((item) => item.classList.toggle('active', item.dataset.nav === (routes[name] ? name : 'resumen')));
	window.scrollTo({ top: 0 });
	show(currentUser);
}

document.getElementById('logout-button').addEventListener('click', logout);
greet(cachedUser());

requireUser(['ADMINISTRADOR']).then((user) => {
	currentUser = user;
	greet(user);
	window.addEventListener('hashchange', route);
	route();
}).catch(() => {});
