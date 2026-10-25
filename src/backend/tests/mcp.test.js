const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { LATEST_PROTOCOL_VERSION, isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js');
const { z } = require('zod');
const { createMcpHttpServer } = require('../../../MCP/server');
const { users, cookieFor, stubSessionUsers } = require('./helpers');
const { requireSession, requireRole } = require('../middlewares/auth');
const { errorHandler } = require('../middlewares/error-handler');

stubSessionUsers();

test('MCP se sirve desde Express y autoriza con la sesión de la aplicación', async () => {
	const db = {
		async execute() {
			return [[{
				id: 17,
				nombres: 'Ana',
				apellidos: 'Gómez',
				id_institucion: 1,
				institucion: 'Escuela',
				rol: 'ESTUDIANTE',
			}]];
		},
	};
	const mcpServer = createMcpHttpServer({
		db,
		getActor: (request) => ({ id: request.user.id, role: request.user.rol }),
		dependencies: { McpServer, StreamableHTTPServerTransport, isInitializeRequest, z },
	});
	const app = express();
	app.use(express.json());
	app.use('/mcp', requireSession, requireRole('ESTUDIANTE', 'DOCENTE'), mcpServer.handleMcpRequest);
	app.use(errorHandler);
	const server = http.createServer(app);
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const endpoint = `http://127.0.0.1:${server.address().port}/mcp`;
	const initialize = {
		jsonrpc: '2.0',
		id: 1,
		method: 'initialize',
		params: {
			protocolVersion: LATEST_PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: { name: 'test-agent', version: '1.0.0' },
		},
	};

	try {
		const unauthenticated = await fetch(endpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(initialize),
		});
		assert.equal(unauthenticated.status, 401);

		const administrator = await fetch(endpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: cookieFor(users.admin) },
			body: JSON.stringify(initialize),
		});
		assert.equal(administrator.status, 403);

		const authenticated = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json, text/event-stream',
				cookie: cookieFor(users.estudiante),
			},
			body: JSON.stringify(initialize),
		});
		assert.equal(authenticated.status, 200);
		assert.ok(authenticated.headers.get('mcp-session-id'));
	} finally {
		await mcpServer.closeMcpSessions();
		await new Promise((resolve) => server.close(resolve));
	}
});
