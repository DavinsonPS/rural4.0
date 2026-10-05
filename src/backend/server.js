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

const app = express();
const port = Number(process.env.PORT);
const frontendPath = path.join(__dirname, '..', 'frontend');
const { pool } = require('./db');

app.disable('x-powered-by');
app.use(express.json());
app.use('/api/dispositivos', deviceRoutes);
app.use('/api/monitoreo', monitoringRoutes);
app.use('/api/proyectos', projectRoutes);
app.use('/api/firmware', firmwareRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/docente', teacherRoutes);
app.use('/api/cuestionarios', quizRoutes);
app.use('/api/admin', adminRoutes);
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

app.listen(port, '0.0.0.0', () => {
	console.log(`Rural 4.0 escuchando en el puerto ${port}`);
});
