const assert = require('node:assert/strict');
const test = require('node:test');
const { createGuardianService, parseEnumValues, selectMessageRoles, openAiTool } = require('../src/guardian.service');
const { z } = require('zod');

test('interpreta los roles del enum de mensajes sin asumir su orden', () => {
	assert.deepEqual(parseEnumValues("enum('ESTUDIANTE','GUARDIÁN','admin')"), ['ESTUDIANTE', 'GUARDIÁN', 'admin']);
	assert.deepEqual(selectMessageRoles(['ESTUDIANTE', 'GUARDIÁN']), {
		userRole: 'ESTUDIANTE',
		assistantRole: 'GUARDIÁN',
	});
	assert.throws(() => selectMessageRoles(['ESTUDIANTE', 'ADMIN']), /enum/);
});

test('convierte una herramienta MCP al formato de herramientas de OpenAI', () => {
	assert.deepEqual(openAiTool({
		name: 'list_my_projects',
		description: 'Consulta los proyectos.',
		inputSchema: { type: 'object', properties: {} },
	}), {
		type: 'function',
		function: {
			name: 'list_my_projects',
			description: 'Consulta los proyectos.',
			parameters: { type: 'object', properties: {} },
		},
	});
});

test('Guardián consulta herramientas MCP, responde con OpenAI y guarda ambos turnos', async () => {
	const queries = [];
	const inserts = [];
	const db = {
		async execute(sql, params) {
			queries.push({ sql, params });
			if (sql.includes('information_schema.COLUMNS')) {
				return [[{ column_type: "enum('ESTUDIANTE','GUARDIÁN')" }]];
			}
			if (sql.includes('FROM tblh_guardian_conversaciones') && sql.includes('SELECT id')) return [[]];
			if (sql.includes('FROM tblh_usuarios u')) {
				return [[{
					id: 17,
					nombres: 'Ana',
					apellidos: 'Prueba',
					id_institucion: 4,
					institucion: 'Escuela',
					rol: 'ESTUDIANTE',
				}]];
			}
			if (sql.includes('FROM tblh_proyectos p')) {
				return [[{
					id: 12,
					id_usuario: 17,
					id_docente: 2,
					nombre: 'Proyecto de Ana',
					fecha_inicio: '2026-10-01',
				}]];
			}
			throw new Error(`Consulta inesperada en test: ${sql}`);
		},
		async getConnection() {
			return {
				async beginTransaction() {},
				async commit() {},
				async rollback() {},
				release() {},
				async execute(sql, params) {
					inserts.push({ sql, params });
					if (sql.includes('INSERT INTO tblh_guardian_conversaciones')) return [{ insertId: 91 }];
					return [{ affectedRows: 2 }];
				},
			};
		},
	};
	let openAiCalls = 0;
	class FakeOpenAI {
		constructor(options) {
			assert.equal(options.apiKey, 'test-key');
			this.chat = { completions: { create: async (request) => {
				openAiCalls += 1;
				assert.equal(request.model, 'gpt-test');
				assert.equal(request.reasoning_effort, 'none');
				assert.match(request.messages[0].content, /Te llamas Guardián/);
				assert.ok(request.tools.some(({ function: tool }) => tool.name === 'list_my_projects'));
				if (openAiCalls === 1) {
					return { choices: [{ message: {
						role: 'assistant',
						content: null,
						tool_calls: [{
							id: 'call_projects',
							type: 'function',
							function: { name: 'list_my_projects', arguments: '{}' },
						}],
					} }] };
				}
				const toolMessage = request.messages.find((message) => message.role === 'tool');
				assert.ok(toolMessage);
				assert.match(toolMessage.content, /cantidad_proyectos/);
				return { choices: [{ message: { role: 'assistant', content: '¡Hola, Ana! Aún no hay proyectos. ¿Creamos uno para tu planta?' } }] };
			} } };
		}
	}

	const service = createGuardianService({
		db,
		env: { OPENAI_API_KEY: 'test-key', MODELO: 'gpt-test' },
		dependencies: { OpenAIClient: FakeOpenAI },
	});
	const result = await service.chat(
		{ id: 17, rol: 'ESTUDIANTE' },
		{ message: '¿Cuáles son mis proyectos?', projectId: 12 },
	);

	assert.equal(openAiCalls, 2);
	assert.deepEqual(result, {
		conversation_id: 91,
		reply: '¡Hola, Ana! Aún no hay proyectos. ¿Creamos uno para tu planta?',
	});
	assert.ok(queries.some(({ sql }) => sql.includes('FROM tblh_usuarios u')));
	assert.ok(inserts.some(({ sql, params }) => sql.includes('INSERT INTO tblh_guardian_conversaciones')
		&& params[0] === 17 && params[1] === 12));
	const messageInsert = inserts.find(({ sql }) => sql.includes('INSERT INTO tblh_guardian_mensajes'));
	assert.deepEqual(messageInsert.params, [
		91,
		'ESTUDIANTE',
		'¿Cuáles son mis proyectos?',
		91,
		'GUARDIÁN',
		'¡Hola, Ana! Aún no hay proyectos. ¿Creamos uno para tu planta?',
	]);
});

test('rechaza chat sin proyecto antes de consultar perfil o guardar conversación', async () => {
	let dbCalls = 0;
	const service = createGuardianService({
		db: {
			async execute() {
				dbCalls += 1;
				throw new Error('No debe consultar la base de datos.');
			},
			async getConnection() {
				throw new Error('No debe guardar una conversación.');
			},
		},
		env: {},
		dependencies: { OpenAIClient: class {} },
	});
	await assert.rejects(
		service.chat({ id: 17, rol: 'ESTUDIANTE' }, { message: '¿Cómo se llama mi planta?' }),
		{ status: 400 },
	);
	assert.equal(dbCalls, 0);
});

test('rechaza proyecto que no pertenece al estudiante antes de guardar conversación', async () => {
	let openAiCalls = 0;
	let saveCalls = 0;
	const service = createGuardianService({
		db: {
			async execute(sql) {
				if (sql.includes('FROM tblh_proyectos p')) return [[]];
				throw new Error('No debe consultar otros datos.');
			},
			async getConnection() {
				saveCalls += 1;
				throw new Error('No debe guardar una conversación.');
			},
		},
		env: { OPENAI_API_KEY: 'test-key', MODELO: 'gpt-test' },
		dependencies: {
			OpenAIClient: class {
				constructor() {
					openAiCalls += 1;
				}
			},
		},
	});
	await assert.rejects(
		service.chat({ id: 17, rol: 'ESTUDIANTE' }, { message: '¿Cómo se llama mi planta?', projectId: 12 }),
		{ status: 404, message: 'No encontré ese proyecto para tu cuenta.' },
	);
	assert.equal(openAiCalls, 0);
	assert.equal(saveCalls, 0);
});

test('rechaza mensajes vacíos antes de llamar a OpenAI', async () => {
	let connected = false;
	const service = createGuardianService({
		db: { execute: async () => [[]], getConnection: async () => { connected = true; } },
		env: {},
		dependencies: { OpenAIClient: class {} },
	});
	await assert.rejects(
		service.chat({ id: 17, rol: 'ESTUDIANTE' }, { message: '   ' }),
		{ status: 400 },
	);
	assert.equal(connected, false);
});

test('initialization validates config, role schema and MCP tools before accepting chats', async () => {
	const db = {
		async execute(sql) {
			assert.match(sql, /information_schema\.COLUMNS/);
			return [[{ column_type: "enum('ESTUDIANTE','GUARDIÁN')" }]];
		},
		getConnection: async () => { throw new Error('No chat should be written during startup.'); },
	};
	let toolDiscoveryCount = 0;
	class FakeClient {
		constructor() {}
		async connect() {}
		async listTools() {
			toolDiscoveryCount += 1;
			return { tools: [{ name: 'get_my_profile' }] };
		}
		async close() {}
	}
	class FakeMcpServer {
		constructor() {}
		registerTool() {}
		async connect() {}
		async close() {}
	}
	const service = createGuardianService({
		db,
		env: { OPENAI_API_KEY: 'test-key', MODELO: 'gpt-test' },
		dependencies: {
			OpenAIClient: class {},
			Client: FakeClient,
			InMemoryTransport: { createLinkedPair: () => [{}, {}] },
			McpServer: FakeMcpServer,
			z,
		},
	});

	await service.initialize();
	assert.equal(toolDiscoveryCount, 1);
});
