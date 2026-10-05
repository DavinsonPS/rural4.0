// Envuelve un handler async: los errores esperados (HttpError) salen con su código y
// los inesperados con el mensaje genérico de la ruta, sin exponer detalles internos.
function handler(failureMessage, action) {
	return async (request, response, next) => {
		try {
			await action(request, response);
		} catch (error) {
			if (!error.failureMessage) error.failureMessage = failureMessage;
			next(error);
		}
	};
}

function positiveInteger(value) {
	const number = Number(value);
	return Number.isInteger(number) && number > 0 ? number : null;
}

function text(value) {
	return typeof value === 'string' ? value.trim() : '';
}

module.exports = { handler, positiveInteger, text };
