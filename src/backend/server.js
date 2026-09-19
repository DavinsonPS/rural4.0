const path = require('node:path');
require('dotenv').config();
const express = require('express');
const deviceRoutes = require('./routes/devices.routes');
const monitoringRoutes = require('./routes/monitoring.routes');
const projectRoutes = require('./routes/projects.routes');
const firmwareRoutes = require('./routes/firmware.routes');
const authRoutes = require('./routes/auth.routes');
const { readSession } = require('./session');

const app = express();
const port = Number(process.env.PORT);
const frontendPath = path.join(__dirname, '..', 'frontend');
const { pool } = require('./db');
const registrationKey = process.env.DEVICE_REGISTRATION_KEY || '';

app.disable('x-powered-by');
app.use(express.json());
app.use('/api/dispositivos', deviceRoutes);
app.use('/api/monitoreo', monitoringRoutes);
app.use('/api/proyectos', projectRoutes);
app.use('/api/firmware', firmwareRoutes);
app.use('/api/auth', authRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get(['/estudiante.html', '/docente.html'], (request, response, next) => {
	const session = readSession(request);
	const allowedRoles = request.path === '/estudiante.html' ? ['ESTUDIANTE'] : ['DOCENTE', 'ADMINISTRADOR'];
	if (!session || !allowedRoles.includes(session.rol)) {
		return response.redirect('/');
	}
	response.setHeader('Cache-Control', 'no-store');
	next();
});

app.use(express.static(frontendPath));

app.get('/api/config', (request, response) => {
	response.json({
		registrationKey,
	});
});

app.get('/api/health', (request, response) => {
	response.json({
		status: 'ok',
		service: 'rural40',
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

app.get(/.*/, (request, response) => {
	response.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
	console.log(`Rural 4.0 escuchando en el puerto ${port}`);
});
