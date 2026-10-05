const proyectosRepo = require('../repositories/proyectos.repo');
const lecturasRepo = require('../repositories/lecturas.repo');
const { evaluate } = require('./semaforo');
const { clean } = require('./lecturas.service');
const { ROLES, SEMAFORO } = require('../config/catalogos');
const { toCsv } = require('../lib/csv');

function sensorOnline(row) {
	return Boolean(row.id_dispositivo) && row.sensor_minutos_sin_contacto !== null
		&& Number(row.sensor_minutos_sin_contacto) <= SEMAFORO.SENSOR_SIN_CONEXION_MIN;
}

// Proyectos visibles para el actor con su semáforo. El administrador ve todos.
async function listProjects(actor) {
	const rows = await proyectosRepo.listForTeacherPanel(actor.rol === ROLES.ADMINISTRADOR ? null : actor.id);
	const readings = await lecturasRepo.listLatestPerProject(rows.map((row) => row.id), SEMAFORO.LECTURAS_EN_CERO_SEGUIDAS);
	const readingsByProject = new Map();
	readings.forEach((reading) => {
		if (!readingsByProject.has(reading.id_proyecto)) readingsByProject.set(reading.id_proyecto, []);
		readingsByProject.get(reading.id_proyecto).push(reading);
	});
	return rows.map((row) => {
		const projectReadings = readingsByProject.get(row.id) || [];
		const { nivel, alertas } = evaluate(row, projectReadings);
		const latest = projectReadings[0] ? clean(projectReadings[0]) : null;
		return {
			id: row.id,
			nombre: row.nombre,
			descripcion: row.descripcion,
			planta: row.planta,
			id_planta: row.id_planta,
			fecha_inicio: row.fecha_inicio,
			fecha_fin: row.fecha_fin,
			finalizado: Boolean(row.fecha_fin),
			estudiante: {
				id: row.id_estudiante,
				nombres: row.estudiante_nombres,
				apellidos: row.estudiante_apellidos,
				usuario: row.estudiante_usuario,
			},
			sensor: row.id_dispositivo ? {
				codigo_interno: row.sensor_codigo,
				minutos_sin_contacto: row.sensor_minutos_sin_contacto,
				en_linea: sensorOnline(row),
			} : null,
			camara: row.id_dispositivo_camara ? {
				codigo_interno: row.camara_codigo,
				minutos_sin_contacto: row.camara_minutos_sin_contacto,
			} : null,
			led: { configuracion: row.configuracion_led, color: row.color_led, brillo: row.brillo_led, tierra: row.tipo_tierra },
			ultima_bitacora: row.ultima_bitacora,
			dias_sin_bitacora: row.dias_sin_bitacora,
			dias_desde_inicio: row.dias_desde_inicio,
			bitacoras_7d: Number(row.bitacoras_7d) || 0,
			bitacoras_30d: Number(row.bitacoras_30d) || 0,
			retos_total: Number(row.retos_total) || 0,
			ultima_lectura: latest,
			nivel,
			alertas,
		};
	});
}

function summarize(projects) {
	const active = projects.filter((project) => !project.finalizado);
	const window = (project) => Math.min(7, Math.max(1, Number(project.dias_desde_inicio) || 1));
	const expectedLogs = active.reduce((total, project) => total + window(project), 0);
	const actualLogs = active.reduce((total, project) => total + Math.min(project.bitacoras_7d, window(project)), 0);
	const linkedSensors = active.filter((project) => project.sensor);
	const alerts = { rojo: 0, naranja: 0, amarillo: 0, verde: 0 };
	active.forEach((project) => { alerts[project.nivel] += 1; });
	return {
		estudiantes_activos: new Set(active.map((project) => project.estudiante.id)).size,
		proyectos_en_curso: active.length,
		proyectos_finalizados: projects.length - active.length,
		bitacoras_al_dia_pct: expectedLogs ? Math.round((actualLogs / expectedLogs) * 100) : null,
		dispositivos_vinculados: linkedSensors.length,
		dispositivos_en_linea: linkedSensors.filter((project) => project.sensor.en_linea).length,
		alertas: alerts,
	};
}

async function panelSummary(actor) {
	return summarize(await listProjects(actor));
}

async function exportCsv(actor) {
	const projects = await listProjects(actor);
	const headers = ['Estudiante', 'Usuario', 'Proyecto', 'Planta', 'Estado', 'Semáforo', 'Fecha inicio', 'Fecha fin',
		'Bitácoras últimos 7 días', 'Bitácoras últimos 30 días', 'Retos completados', 'Última bitácora',
		'Última lectura', 'Temperatura (°C)', 'Humedad suelo (%)', 'Luz (lx)', 'Sensor', 'Cámara', 'Alertas'];
	const rows = projects.map((project) => {
		const reading = project.ultima_lectura;
		return [
			`${project.estudiante.apellidos} ${project.estudiante.nombres}`.trim(),
			project.estudiante.usuario,
			project.nombre,
			project.planta,
			project.finalizado ? 'Finalizado' : 'En curso',
			project.nivel,
			project.fecha_inicio || '',
			project.fecha_fin || '',
			project.bitacoras_7d,
			project.bitacoras_30d,
			project.retos_total,
			project.ultima_bitacora || '',
			reading?.fecha_texto || '',
			reading?.temperatura_c ?? '',
			reading?.humedad_suelo_pct ?? '',
			reading?.intensidad_luz_lux ?? '',
			project.sensor?.codigo_interno || '',
			project.camara?.codigo_interno || '',
			project.alertas.map((alert) => alert.mensaje).join(' | '),
		];
	});
	return toCsv(headers, rows);
}

module.exports = { listProjects, summarize, panelSummary, exportCsv };
