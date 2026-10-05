class HttpError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

class ValidationError extends HttpError {
	constructor(message) {
		super(400, message);
	}
}

class UnauthorizedError extends HttpError {
	constructor(message = 'Tu sesión expiró. Inicia sesión de nuevo.') {
		super(401, message);
	}
}

class ForbiddenError extends HttpError {
	constructor(message = 'No tienes permiso para realizar esta acción.') {
		super(403, message);
	}
}

class NotFoundError extends HttpError {
	constructor(message = 'Recurso no encontrado.') {
		super(404, message);
	}
}

class ConflictError extends HttpError {
	constructor(message) {
		super(409, message);
	}
}

module.exports = { HttpError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError };
