const { handler, positiveInteger } = require('../../src/backend/lib/http');
const { ValidationError } = require('../../src/backend/lib/errors');
const { createGuardianService } = require('./guardian.service');

function createGuardianRouter({ express, db, service, dependencies }) {
	if (!express || typeof express.Router !== 'function') {
		throw new Error('Guardián necesita la instancia de Express del backend.');
	}
	const router = express.Router();
	const guardianService = service || createGuardianService({ db, dependencies });

	router.get('/conversaciones', handler('No fue posible cargar tus conversaciones.', async (request, response) => {
		const projectId = positiveInteger(request.query.project_id);
		if (!projectId) throw new ValidationError('Selecciona un proyecto válido para ver tus conversaciones.');
		response.setHeader('Cache-Control', 'no-store');
		response.json(await guardianService.listConversations(request.user.id, projectId));
	}));

	router.get('/conversaciones/:conversationId', handler('No fue posible cargar esta conversación.', async (request, response) => {
		const conversationId = positiveInteger(request.params.conversationId);
		if (!conversationId) throw new ValidationError('La conversación seleccionada no es válida.');
		response.setHeader('Cache-Control', 'no-store');
		response.json(await guardianService.getMessages(request.user.id, conversationId));
	}));

	router.post('/chat', handler('No pude responder ahora. Inténtalo de nuevo en un momento.', async (request, response) => {
		const conversationId = request.body?.conversation_id == null
			? null
			: positiveInteger(request.body.conversation_id);
		const projectId = positiveInteger(request.body?.project_id);
		if (request.body?.conversation_id != null && !conversationId) {
			throw new ValidationError('La conversación seleccionada no es válida.');
		}
		if (!projectId) throw new ValidationError('Selecciona un proyecto válido antes de conversar con Guardián.');
		response.setHeader('Cache-Control', 'no-store');
		response.json(await guardianService.chat(request.user, {
			message: request.body?.message,
			conversationId,
			projectId,
		}));
	}));

	return router;
}

module.exports = { createGuardianRouter };
