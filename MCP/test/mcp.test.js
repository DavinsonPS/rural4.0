const assert = require('node:assert/strict');
const test = require('node:test');
const { z } = require('zod');
const { LATEST_PROTOCOL_VERSION } = require('@modelcontextprotocol/sdk/types.js');
const { toColombiaDate } = require('../time');
const { aggregateReadings, dateDaysAgo, registerGuardianTools } = require('../tools');
const { createMcpHttpServer, loadConfig, readActorHeaders, tokenMatches } = require('../server');

test('Colombia date uses the America/Bogota calendar date', () => {
	assert.equal(toColombiaDate(new Date('2024-01-01T04:30:00.000Z')), '2023-12-31');
});

test('dateDaysAgo returns today for a one-day window', () => {
	assert.equal(dateDaysAgo(1), toColombiaDate());
});

test('sensor readings are averaged per day and nulls remain null', () => {
	assert.deepEqual(aggregateReadings([
		{ fecha_lectura: '2026-10-12 08:00:00', temperatura_c: 20, humedad_ambiente_pct: null },
		{ fecha_lectura: '2026-10-12 09:00:00', temperatura_c: 22, humedad_ambiente_pct: null },
	]), [{
		fecha: '2026-10-12',
		lecturas: 2,
		temperatura_c: 21,
		humedad_ambiente_pct: null,
		humedad_suelo_pct: null,
		intensidad_luz_lux: null,
	}]);
});

test('MCP tool schemas leave actor identity out of model-controlled arguments', async () => {
	const registered = new Map();
	const trustedActor = { id: 17, nombres: 'Ana', apellidos: 'Prueba', rol: 'ESTUDIANTE', institucion: 'Escuela' };
	registerGuardianTools({
		registerTool(name, options, handler) {
			registered.set(name, { options, handler });
		},
	}, {
		z,
		db: { execute: async () => [[]] },
		getActor: async () => trustedActor,
	});

	assert.deepEqual(Object.keys(registered.get('get_my_profile').options.inputSchema), []);
	assert.deepEqual(Object.keys(registered.get('get_project_overview').options.inputSchema), ['project_id']);

	const result = await registered.get('get_my_profile').handler({ actor_id: 999, actor_role: 'DOCENTE' });
	assert.deepEqual(JSON.parse(result.content[0].text), {
		nombre: 'Ana Prueba',
		rol: 'ESTUDIANTE',
		institucion: 'Escuela',
	});
});

test('project count matches the projects returned by the 20-item limit', async () => {
	const registered = new Map();
	registerGuardianTools({
		registerTool(name, options, handler) {
			registered.set(name, { options, handler });
		},
	}, {
		z,
		db: {
			async execute() {
				return [Array.from({ length: 20 }, (_, index) => ({
					id: index + 1,
					nombre: `Proyecto ${index + 1}`,
					planta: 'Maíz',
					fecha_inicio: null,
					fecha_fin: null,
					estudiante: null,
				}))];
			},
		},
		getActor: async () => ({ id: 17, rol: 'ESTUDIANTE' }),
	});

	const result = await registered.get('list_my_projects').handler({});
	const value = JSON.parse(result.content[0].text);
	assert.equal(value.cantidad_proyectos, 20);
	assert.equal(value.proyectos.length, 20);
});

test('service authentication requires the exact bearer token', () => {
	assert.equal(tokenMatches('Bearer trusted-secret', 'trusted-secret'), true);
	assert.equal(tokenMatches('Bearer other-secret', 'trusted-secret'), false);
	assert.equal(tokenMatches('trusted-secret', 'trusted-secret'), false);
});

test('actor headers accept only positive safe IDs and supported roles', () => {
	assert.deepEqual(readActorHeaders({
		'x-rural40-actor-id': '42',
		'x-rural40-actor-role': 'DOCENTE',
	}), { id: 42, role: 'DOCENTE' });
	assert.equal(readActorHeaders({
		'x-rural40-actor-id': '0',
		'x-rural40-actor-role': 'DOCENTE',
	}), null);
	assert.equal(readActorHeaders({
		'x-rural40-actor-id': '42',
		'x-rural40-actor-role': 'ADMIN',
	}), null);
});

test('startup config fails explicitly when required settings are absent', () => {
	assert.throws(() => loadConfig({}), /MCP_SERVICE_TOKEN/);
});

test('startup config prefers the hosting-assigned PORT', () => {
	const config = loadConfig({
		MCP_SERVICE_TOKEN: 'test-token',
		DB_HOST: '127.0.0.1',
		DB_NAME: 'rural',
		DB_USER: 'reader',
		DB_PASSWORD: 'secret',
		MCP_PORT: '3000',
		PORT: '8080',
	});
	assert.equal(config.port, 8080);
	assert.equal(config.host, '127.0.0.1');
});

test('HTTP MCP binds verified actor identity to its session', async () => {
	const databaseCalls = [];
	const db = {
		async execute(sql, params) {
			databaseCalls.push({ sql, params });
			return [[{
				id: 17,
				nombres: 'Ana',
				apellidos: 'Prueba',
				id_institucion: 4,
				institucion: 'Escuela',
				rol: 'ESTUDIANTE',
			}]];
		},
	};
	const server = createMcpHttpServer({ db, serviceToken: 'test-service-token' });
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	const endpoint = `http://127.0.0.1:${address.port}/mcp`;
	const actorHeaders = {
		authorization: 'Bearer test-service-token',
		'x-rural40-actor-id': '17',
		'x-rural40-actor-role': 'ESTUDIANTE',
		'content-type': 'application/json',
		accept: 'application/json, text/event-stream',
	};

	try {
		const unauthorized = await fetch(endpoint, {
			method: 'POST',
			headers: { ...actorHeaders, authorization: 'Bearer wrong-token' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
		});
		assert.equal(unauthorized.status, 401);

		const initialized = await fetch(endpoint, {
			method: 'POST',
			headers: actorHeaders,
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: {
					protocolVersion: LATEST_PROTOCOL_VERSION,
					capabilities: {},
					clientInfo: { name: 'test-agent', version: '1.0.0' },
				},
			}),
		});
		assert.equal(initialized.status, 200);
		const sessionId = initialized.headers.get('mcp-session-id');
		assert.ok(sessionId);

		const listed = await fetch(endpoint, {
			method: 'POST',
			headers: { ...actorHeaders, 'mcp-session-id': sessionId },
			body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
		});
		assert.equal(listed.status, 200);
		const toolList = await listed.json();
		const profileTool = toolList.result.tools.find(({ name }) => name === 'get_my_profile');
		assert.deepEqual(profileTool.inputSchema.properties, {});

		const changedActor = await fetch(endpoint, {
			method: 'POST',
			headers: { ...actorHeaders, 'mcp-session-id': sessionId, 'x-rural40-actor-id': '18' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} }),
		});
		assert.equal(changedActor.status, 403);

		const profile = await fetch(endpoint, {
			method: 'POST',
			headers: { ...actorHeaders, 'mcp-session-id': sessionId },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 4,
				method: 'tools/call',
				params: { name: 'get_my_profile', arguments: { actor_id: 999, actor_role: 'DOCENTE' } },
			}),
		});
		assert.equal(profile.status, 200);
		const result = await profile.json();
		assert.deepEqual(JSON.parse(result.result.content[0].text), {
			nombre: 'Ana Prueba',
			rol: 'ESTUDIANTE',
			institucion: 'Escuela',
		});
		assert.ok(databaseCalls.every(({ params }) => params[0] === 17));
	} finally {
		await server.closeMcpSessions();
		await new Promise((resolve) => server.close(resolve));
	}
});

test('HTTP MCP can use the authenticated application session as its actor', async () => {
	const db = {
		async execute() {
			return [[{
				id: 17,
				nombres: 'Ana',
				apellidos: 'Prueba',
				id_institucion: 4,
				institucion: 'Escuela',
				rol: 'ESTUDIANTE',
			}]];
		},
	};
	const server = createMcpHttpServer({
		db,
		getActor: () => ({ id: 17, role: 'ESTUDIANTE' }),
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const endpoint = `http://127.0.0.1:${server.address().port}/mcp`;

	try {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: {
					protocolVersion: LATEST_PROTOCOL_VERSION,
					capabilities: {},
					clientInfo: { name: 'test-agent', version: '1.0.0' },
				},
			}),
		});

		assert.equal(response.status, 200);
		assert.ok(response.headers.get('mcp-session-id'));
	} finally {
		await server.closeMcpSessions();
		await new Promise((resolve) => server.close(resolve));
	}
});
