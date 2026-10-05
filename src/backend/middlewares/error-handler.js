const { HttpError, NotFoundError } = require('../lib/errors');

function apiNotFound(request, response, next) {
	next(new NotFoundError('Ruta de la API no encontrada.'));
}

// Express reconoce el manejador de errores por sus 4 parámetros; `next` debe quedarse.
function errorHandler(error, request, response, next) {
	if (response.headersSent) return;
	if (error instanceof HttpError) {
		return response.status(error.status).json({ error: error.message });
	}
	if (error.type === 'entity.parse.failed') {
		return response.status(400).json({ error: 'El cuerpo de la petición no es JSON válido.' });
	}
	if (error.type === 'entity.too.large' || error.code === 'LIMIT_FILE_SIZE') {
		return response.status(413).json({ error: 'El archivo supera el tamaño permitido.' });
	}
	console.error(`${request.method} ${request.originalUrl} failed:`, error.message);
	return response.status(500).json({ error: error.failureMessage || 'Ocurrió un error inesperado.' });
}

module.exports = { apiNotFound, errorHandler };
