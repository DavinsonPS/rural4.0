import { api } from './api.js';

const homeByRole = { ESTUDIANTE: '/estudiante.html', DOCENTE: '/docente.html', ADMINISTRADOR: '/admin.html' };

export function cachedUser() {
	try {
		return JSON.parse(localStorage.getItem('rural40_user') || 'null');
	} catch {
		return null;
	}
}

// La identidad la confirma el servidor. localStorage solo sirve para pintar el saludo rápido.
export async function requireUser(allowedRoles) {
	const user = await api('/api/auth/me');
	if (!allowedRoles.includes(user.rol)) {
		window.location.replace(homeByRole[user.rol] || '/');
		throw new Error('Rol no permitido en esta página.');
	}
	try { localStorage.setItem('rural40_user', JSON.stringify(user)); } catch { /* almacenamiento no disponible */ }
	return user;
}

export async function logout() {
	try {
		await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
	} finally {
		try { localStorage.removeItem('rural40_user'); } catch { /* almacenamiento no disponible */ }
		window.location.replace('/');
	}
}
