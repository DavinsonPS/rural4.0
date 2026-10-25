const path = require('node:path');
require('dotenv').config();
const express = require('express');
const deviceRoutes = require('./routes/devices.routes');
const monitoringRoutes = require('./routes/monitoring.routes');
const projectRoutes = require('./routes/projects.routes');
const firmwareRoutes = require('./routes/firmware.routes');
const authRoutes = require('./routes/auth.routes');
const teacherRoutes = require('./routes/docente.routes');
const quizRoutes = require('./routes/cuestionarios.routes');
const adminRoutes = require('./routes/admin.routes');
const { readSession } = require('./session');
const { apiNotFound, errorHandler } = require('./middlewares/error-handler');
const { requireSession, requireRole } = require('./middlewares/auth');
const { pool } = require('./db');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js');
const { z } = require('zod');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const OpenAI = require('openai');
const { createMcpHttpServer } = require('../../MCP/server');
const { createGuardianRouter } = require('../../AGENTE/src/guardian.routes');
const { createGuardianService } = require('../../AGENTE/src/guardian.service');

const app = express();
const port = Number(process.env.PORT);
const frontendPath = path.join(__dirname, '..', 'frontend');
const mcpServer = createMcpHttpServer({
	db: pool,
	getActor: (request) => ({ id: request.user.id, role: request.user.rol }),
	dependencies: { McpServer, StreamableHTTPServerTransport, isInitializeRequest, z },
});
const guardianService = createGuardianService({
	db: pool,
	dependencies: {
		Client,
		InMemoryTransport,
		McpServer,
		OpenAIClient: OpenAI.default,
		z,
	},
});
const MCP_RETRY_INTERVAL_MS = 30_000;
let mcpReady = false;
let mcpCheckInProgress = false;
let mcpRetryTimer;
let guardianReady = false;
let guardianCheckInProgress = false;
let guardianRetryTimer;

async function checkMcpReadiness() {
	if (mcpReady || mcpCheckInProgress) return;
	mcpCheckInProgress = true;
	try {
		await mcpServer.initializeMcp();
		mcpReady = true;
		clearInterval(mcpRetryTimer);
		console.log('MCP listo.');
		void checkGuardianReadiness();
	} catch (error) {
		console.error(`[MCP] Readiness check failed (${error?.code || error?.name || 'Error'}); retrying in 30 seconds.`);
	} finally {
		mcpCheckInProgress = false;
	}
}

async function checkGuardianReadiness() {
	if (!mcpReady || guardianReady || guardianCheckInProgress) return;
	guardianCheckInProgress = true;
	try {
		await guardianService.initialize();
		guardianReady = true;
		clearInterval(guardianRetryTimer);
		console.log('Guardián listo.');
	} catch (error) {
		console.error(`[Guardián] Readiness check failed (${error?.code || error?.name || 'Error'}); retrying in 30 seconds.`);
	} finally {
		guardianCheckInProgress = false;
	}
}

function requireMcpReady(request, response, next) {
	if (!mcpReady) {
		return response.status(503).json({ error: 'MCP is temporarily unavailable.' });
	}
	return next();
}

function requireGuardianReady(request, response, next) {
	if (!guardianReady) {
		return response.status(503).json({ error: 'Guardián is temporarily unavailable.' });
	}
	return next();
}

app.disable('x-powered-by');
app.use(express.json());
app.use('/mcp', requireSession, requireRole('ESTUDIANTE', 'DOCENTE'), requireMcpReady, mcpServer.handleMcpRequest);
app.use('/api/dispositivos', deviceRoutes);
app.use('/api/monitoreo', monitoringRoutes);
app.use('/api/proyectos', projectRoutes);
app.use('/api/firmware', firmwareRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/docente', teacherRoutes);
app.use('/api/cuestionarios', quizRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/guardian', requireSession, requireRole('ESTUDIANTE'), requireGuardianReady, createGuardianRouter({
	express,
	db: pool,
	service: guardianService,
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Una foto que no existe responde 404, no la página de inicio (que confundiría al navegador).
app.use('/uploads', (request, response) => response.status(404).end());

const pageRoles = {
	'/estudiante.html': ['ESTUDIANTE'],
	'/docente.html': ['DOCENTE', 'ADMINISTRADOR'],
	'/admin.html': ['ADMINISTRADOR'],
};

app.get(Object.keys(pageRoles), (request, response, next) => {
	const session = readSession(request);
	const allowedRoles = pageRoles[request.path];
	if (!session || !allowedRoles.includes(session.rol)) {
		return response.redirect('/');
	}
	response.setHeader('Cache-Control', 'no-store');
	next();
});

app.use(express.static(frontendPath));

// Se conserva por compatibilidad con páginas en caché, pero ya no expone la clave de registro.
app.get('/api/config', (request, response) => {
	response.json({});
});

app.get('/api/health', (request, response) => {
	response.json({
		status: 'ok',
		service: 'rural40',
		mcp: mcpReady ? 'ready' : 'unavailable',
		guardian: guardianReady ? 'ready' : 'unavailable',
	});
});

app.get('/api/health/db', async (request, response) => {
	try {
		await pool.query('SELECT 1 AS connected');
		response.json({ status: 'ok', database: 'connected' });
	} catch (error) {
		console.error('Database health check failed:', error.message);
		response.status(503).json({ status: 'error', database: 'unavailable' });
	}
});

app.use('/api', apiNotFound);

app.get(/.*/, (request, response) => {
	response.sendFile(path.join(frontendPath, 'index.html'));
});

app.use(errorHandler);

function start() {
	const server = app.listen(port, '0.0.0.0', () => {
		console.log(`Rural 4.0 escuchando en el puerto ${port}`);
	});
	server.on('error', (error) => {
		console.error(`[Rural 4.0] HTTP server failed (${error?.code || error?.name || 'Error'}).`);
	});
	server.on('close', () => {
		clearInterval(mcpRetryTimer);
		clearInterval(guardianRetryTimer);
		mcpServer.closeMcpSessions().catch((error) => {
			console.error(`[MCP] Session shutdown failed (${error?.code || error?.name || 'Error'}).`);
		});
	});

	void checkMcpReadiness();
	mcpRetryTimer = setInterval(() => {
		void checkMcpReadiness();
	}, MCP_RETRY_INTERVAL_MS);
	mcpRetryTimer.unref();
	guardianRetryTimer = setInterval(() => {
		void checkGuardianReadiness();
	}, MCP_RETRY_INTERVAL_MS);
	guardianRetryTimer.unref();
	return server;
}

start();

module.exports = { app, start };
