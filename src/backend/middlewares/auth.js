const { readSession } = require('../session');
const usuariosRepo = require('../repositories/usuarios.repo');
const { UnauthorizedError, ForbiddenError } = require('../lib/errors');

// La identidad sale de la cookie firmada y se confirma contra la BD en cada petición:
// una cuenta desactivada pierde el acceso de inmediato y el rol siempre es el vigente.
async function loadUser(request) {
	const session = readSession(request);
	if (!session) return null;
	return usuariosRepo.findActiveSessionUser(session.id);
}

async function requireSession(request, response, next) {
	try {
		const user = await loadUser(request);
		if (!user) return next(new UnauthorizedError());
		request.user = user;
		return next();
	} catch (error) {
		error.failureMessage = 'No fue posible validar la sesión.';
		return next(error);
	}
}

function requireRole(...roles) {
	return (request, response, next) => {
		if (!request.user || !roles.includes(request.user.rol)) return next(new ForbiddenError());
		return next();
	};
}

function hasRegistrationKey(request) {
	const configuredKey = String(process.env.DEVICE_REGISTRATION_KEY || '').trim();
	return Boolean(configuredKey) && request.get('x-registration-key') === configuredKey;
}

// Herramientas internas pueden seguir usando X-Registration-Key; el navegador usa la sesión.
function requireSessionOrRegistrationKey(request, response, next) {
	if (hasRegistrationKey(request)) {
		request.user = { internal: true };
		return next();
	}
	return requireSession(request, response, next);
}

module.exports = { requireSession, requireRole, requireSessionOrRegistrationKey, hasRegistrationKey };
