const { randomUUID, timingSafeEqual } = require('node:crypto');
const http = require('node:http');
const { registerGuardianTools, verifyActor } = require('./tools');

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_SESSIONS = 100;
const SESSION_IDLE_MS = 30 * 60 * 1000;

function loadConfig(env = process.env) {
	const required = ['MCP_SERVICE_TOKEN', 'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
	for (const name of required) {
		if (!env[name]) throw new Error(`Falta configurar ${name}.`);
	}

	const port = Number(env.PORT || env.MCP_PORT || 3000);
	const dbPort = Number(env.DB_PORT || 3306);
	const connectionLimit = Number(env.DB_CONNECTION_LIMIT || 5);
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MCP_PORT debe ser un puerto válido.');
	if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) throw new Error('DB_PORT debe ser un puerto válido.');
	if (!Number.isInteger(connectionLimit) || connectionLimit < 1 || connectionLimit > 50) {
		throw new Error('DB_CONNECTION_LIMIT debe estar entre 1 y 50.');
	}

	return {
		host: env.MCP_HOST || '127.0.0.1',
		port,
		serviceToken: env.MCP_SERVICE_TOKEN,
		db: {
			host: env.DB_HOST,
			port: dbPort,
			database: env.DB_NAME,
			user: env.DB_USER,
			password: env.DB_PASSWORD,
			connectionLimit,
			waitForConnections: true,
			queueLimit: 50,
		},
	};
}

function tokenMatches(authorization, expectedToken) {
	if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;
	const supplied = Buffer.from(authorization.slice(7));
	const expected = Buffer.from(expectedToken);
	return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function readActorHeaders(headers) {
	const rawId = headers['x-rural40-actor-id'];
	const role = headers['x-rural40-actor-role'];
	if (typeof rawId !== 'string' || !/^[1-9]\d*$/.test(rawId) || !['ESTUDIANTE', 'DOCENTE'].includes(role)) return null;
	const id = Number(rawId);
	return Number.isSafeInteger(id) ? { id, role } : null;
}

function sendJson(res, status, body) {
	if (res.headersSent) return;
	res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
	res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
	const chunks = [];
	let bytes = 0;
	for await (const chunk of req) {
		bytes += chunk.length;
		if (bytes > MAX_BODY_BYTES) throw Object.assign(new Error('Request body too large.'), { statusCode: 413 });
		chunks.push(chunk);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch {
		throw Object.assign(new Error('Invalid JSON.'), { statusCode: 400 });
	}
}

function createMcpHttpServer({ db, serviceToken, getActor, maxSessions = MAX_SESSIONS, dependencies = {} }) {
	if (!db || typeof db.execute !== 'function') throw new Error('MCP necesita un pool SQL compatible.');
	if (typeof getActor !== 'function' && !serviceToken) throw new Error('MCP necesita un token de servicio.');
	const McpServer = dependencies.McpServer || require('@modelcontextprotocol/sdk/server/mcp.js').McpServer;
	const StreamableHTTPServerTransport = dependencies.StreamableHTTPServerTransport
		|| require('@modelcontextprotocol/sdk/server/streamableHttp.js').StreamableHTTPServerTransport;
	const isInitializeRequest = dependencies.isInitializeRequest || require('@modelcontextprotocol/sdk/types.js').isInitializeRequest;
	const z = dependencies.z || require('zod').z;
	const sessions = new Map();

	const handleMcpRequest = async (req, res) => {
		const requestPath = new URL(req.originalUrl || req.url || '/', 'http://localhost').pathname;
		if (!['/mcp', '/mcp/'].includes(requestPath)) {
			sendJson(res, 404, { error: 'Not found.' });
			return;
		}
		if (!['POST', 'GET', 'DELETE'].includes(req.method || '')) {
			res.writeHead(405, { allow: 'POST, GET, DELETE' });
			res.end();
			return;
		}
		let actor;
		try {
			if (typeof getActor === 'function') {
				actor = await getActor(req);
			} else if (tokenMatches(req.headers.authorization, serviceToken)) {
				actor = readActorHeaders(req.headers);
			}
		} catch (error) {
			console.error(`[MCP] Actor authentication failed (${error?.code || error?.name || 'Error'}).`);
			sendJson(res, 503, { error: 'MCP request failed.' });
			return;
		}
		if (!actor) {
			sendJson(res, 401, { error: 'Unauthorized.' });
			return;
		}
		if (!Number.isSafeInteger(actor.id) || actor.id <= 0 || !['ESTUDIANTE', 'DOCENTE'].includes(actor.role)) {
			sendJson(res, 400, { error: 'Missing or invalid authenticated actor context.' });
			return;
		}

		try {
			const sessionId = req.headers['mcp-session-id'];
			const body = req.method === 'POST'
				? (req.body === undefined ? await readJsonBody(req) : req.body)
				: undefined;
			if (sessionId) {
				const session = sessions.get(sessionId);
				if (!session) {
					sendJson(res, 404, { error: 'Unknown or expired MCP session.' });
					return;
				}
				if (session.actor.id !== actor.id || session.actor.role !== actor.role) {
					sendJson(res, 403, { error: 'Actor context does not match this MCP session.' });
					return;
				}
				session.lastActive = Date.now();
				await session.transport.handleRequest(req, res, body);
				return;
			}

			if (req.method !== 'POST' || !isInitializeRequest(body)) {
				sendJson(res, 400, { error: 'A new MCP session must start with initialize.' });
				return;
			}
			if (sessions.size >= maxSessions) {
				sendJson(res, 503, { error: 'MCP session capacity reached.' });
				return;
			}

			await verifyActor(db, actor.id, actor.role);
			let session;
			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => randomUUID(),
				enableJsonResponse: true,
				onsessioninitialized: (id) => {
					session.lastActive = Date.now();
					sessions.set(id, session);
				},
			});
			const mcp = new McpServer({ name: 'rural40-mcp', version: '1.0.0' });
			registerGuardianTools(mcp, {
				z,
				db,
				getActor: () => verifyActor(db, actor.id, actor.role),
			});
			session = { actor, transport, mcp };
			transport.onclose = () => {
				if (transport.sessionId) sessions.delete(transport.sessionId);
				mcp.close().catch((error) => console.error(`[MCP] Session close failed (${error?.code || error?.name || 'Error'}).`));
			};
			await mcp.connect(transport);
			await transport.handleRequest(req, res, body);
		} catch (error) {
			const statusCode = error?.statusCode === 403 ? 403 : error?.statusCode === 400 || error?.statusCode === 413 ? error.statusCode : 503;
			if (statusCode === 503) console.error(`[MCP] Request failed (${error?.code || error?.name || 'Error'}).`);
			sendJson(res, statusCode, {
				error: statusCode === 403 ? 'Actor is not authorized.' : statusCode === 400 ? 'Invalid request.' : statusCode === 413 ? 'Request body too large.' : 'MCP request failed.',
			});
		}
	};

	const server = http.createServer(async (req, res) => {
		const url = new URL(req.url || '/', 'http://localhost');
		if (url.pathname === '/healthz' && req.method === 'GET') {
			sendJson(res, 200, { status: 'ok' });
			return;
		}
		await handleMcpRequest(req, res);
	});
	server.handleMcpRequest = handleMcpRequest;
	server.initializeMcp = async () => {
		await db.execute('SELECT 1 AS connected');
	};

	const cleanupTimer = setInterval(() => {
		const cutoff = Date.now() - SESSION_IDLE_MS;
		for (const [sessionId, session] of sessions) {
			if (session.lastActive < cutoff) {
				session.transport.close().catch((error) => console.error(`[MCP] Idle session close failed (${error?.code || error?.name || 'Error'}).`));
				sessions.delete(sessionId);
			}
		}
	}, 60_000);
	cleanupTimer.unref();
	server.on('close', () => clearInterval(cleanupTimer));
	server.closeMcpSessions = async () => {
		const activeSessions = [...sessions.values()];
		sessions.clear();
		await Promise.all(activeSessions.map(async ({ transport }) => {
			try {
				await transport.close();
			} catch (error) {
				console.error(`[MCP] Session shutdown failed (${error?.code || error?.name || 'Error'}).`);
			}
		}));
	};
	return server;
}

async function start() {
	require('dotenv').config();
	const config = loadConfig();
	const mysql = require('mysql2/promise');
	const db = mysql.createPool(config.db);
	const server = createMcpHttpServer({ db, serviceToken: config.serviceToken });
	server.on('error', (error) => {
		const address = error.address ? ` on ${error.address}` : '';
		const port = error.port ? `:${error.port}` : '';
		console.error(`[MCP] HTTP server failed (${error.code || error.name}${address}${port}).`);
		process.exitCode = 1;
	});
	server.listen(config.port, config.host, () => {
		console.log(`rural4.0 MCP escuchando en ${config.host}:${config.port}/mcp`);
	});

	const shutdown = () => {
		server.closeMcpSessions().finally(() => {
			server.close(() => {
				db.end().catch((error) => console.error(`[MCP] Database pool close failed (${error.code || error.name}).`));
			});
		});
	};
	process.once('SIGINT', shutdown);
	process.once('SIGTERM', shutdown);
}

if (require.main === module) {
	try {
		start().catch((error) => {
			console.error(`[MCP] Startup failed (${error.code || error.name || 'Error'}): ${error.message}`);
			process.exitCode = 1;
		});
	} catch (error) {
		console.error(`[MCP] Startup failed: ${error.message}`);
		process.exitCode = 1;
	}
}

module.exports = { createMcpHttpServer, loadConfig, readActorHeaders, tokenMatches };
