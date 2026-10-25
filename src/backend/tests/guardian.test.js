const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { users, stubSessionUsers, startApp } = require('./helpers');
const { createGuardianRouter } = require('../../../AGENTE/src/guardian.routes');
const { requireRole, requireSession } = require('../middlewares/auth');

stubSessionUsers();

test('Guardián expone el chat solo a estudiantes con sesión', async () => {
	const calls = [];
	const service = {
		async listConversations(userId, projectId) {
			calls.push({ action: 'list', userId, projectId });
			return [];
		},
		async getMessages(userId, conversationId) {
			calls.push({ action: 'history', userId, conversationId });
			return { conversation: { id: conversationId }, messages: [] };
		},
		async chat(user, data) {
			calls.push({ action: 'chat', userId: user.id, ...data });
			return { conversation_id: 91, reply: '¡Hola! Cuidemos la planta juntos.' };
		},
	};
	const guardianRoutes = express.Router();
	guardianRoutes.use(requireSession, requireRole('ESTUDIANTE'));
	guardianRoutes.use(createGuardianRouter({ express, db: {}, service }));
	const app = await startApp([['/api/guardian', guardianRoutes]]);

	try {
		assert.equal((await app.request('/api/guardian/conversaciones')).status, 401);
		assert.equal((await app.request('/api/guardian/conversaciones', { user: users.docente })).status, 403);

		const missingProject = await app.request('/api/guardian/chat', {
			user: users.estudiante,
			method: 'POST',
			body: { message: '¿Cómo va mi planta?', project_id: null },
		});
		assert.equal(missingProject.status, 400);

		const list = await app.request('/api/guardian/conversaciones?project_id=12', { user: users.estudiante });
		assert.equal(list.status, 200);
		assert.deepEqual(await list.json(), []);

		const chat = await app.request('/api/guardian/chat', {
			user: users.estudiante,
			method: 'POST',
			body: { message: '¿Cómo va mi planta?', project_id: 12 },
		});
		assert.equal(chat.status, 200);
		assert.deepEqual(await chat.json(), {
			conversation_id: 91,
			reply: '¡Hola! Cuidemos la planta juntos.',
		});
		assert.deepEqual(calls.at(-1), {
			action: 'chat',
			userId: users.estudiante.id,
			message: '¿Cómo va mi planta?',
			conversationId: null,
			projectId: 12,
		});
	} finally {
		await app.close();
	}
});
