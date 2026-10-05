export class ApiError extends Error {
	constructor(message, status) {
		super(message);
		this.status = status;
	}
}

// Cliente único de la API: JSON por defecto, FormData con `form`, y si la sesión expiró
// (401) vuelve al login en lugar de dejar la pantalla a medias.
export async function api(path, { method = 'GET', body, form } = {}) {
	const options = { method, headers: {}, credentials: 'same-origin' };
	if (form) {
		options.body = form;
	} else if (body !== undefined) {
		options.headers['Content-Type'] = 'application/json';
		options.body = JSON.stringify(body);
	}
	const response = await fetch(path, options);
	if (response.status === 401) {
		try { localStorage.removeItem('rural40_user'); } catch { /* almacenamiento no disponible */ }
		window.location.replace('/');
		throw new ApiError('Tu sesión expiró. Inicia sesión de nuevo.', 401);
	}
	const contentType = response.headers.get('content-type') || '';
	const data = contentType.includes('application/json') ? await response.json() : null;
	if (!response.ok) throw new ApiError(data?.error || 'Ocurrió un error. Inténtalo de nuevo.', response.status);
	return data;
}
