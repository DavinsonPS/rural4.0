const { toColombiaDate } = require('./time');

const ALLOWED_ROLES = new Set(['ESTUDIANTE', 'DOCENTE']);
const SENSOR_FIELDS = ['temperatura_c', 'humedad_ambiente_pct', 'humedad_suelo_pct', 'intensidad_luz_lux'];
const ALERTS = { staleMinutes: 1440, drySoilPct: 30, wetSoilPct: 85, hotAirC: 35, coldAirC: 10, missingLogDays: 3 };
const RANGE_PATTERN = /(-?[\d.,]+)\s*(?:-|–|—|a|hasta)\s*(-?[\d.,]+)\s*(°\s*C|º\s*C|lux|lx|%)(?:\s*(VWC))?/gi;

function dateKey(value) {
	if (value instanceof Date) return toColombiaDate(value);
	return String(value || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
}

function dateDaysAgo(days) {
	const [year, month, day] = toColombiaDate().split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day - Math.max(0, days - 1))).toISOString().slice(0, 10);
}

function numberOrNull(value) {
	if (value === null || value === undefined || value === '') return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function isAmbientSensorOff(reading) {
	return Number(reading?.temperatura_c) === 0 && Number(reading?.humedad_ambiente_pct) === 0;
}

function parseRangeNumber(value) {
	const normalized = String(value).replace(/,/g, '.');
	const parts = normalized.split('.');
	if (parts.length > 1 && parts.at(-1).length === 3) return Number(parts.join(''));
	return Number(normalized);
}

function parsePlantTargets(description) {
	const text = String(description || '');
	const targets = { temperatura_c: null, humedad_ambiente_pct: null, humedad_suelo_pct: null, humedad_suelo_unidad: null, intensidad_luz_lux: null };
	for (const match of text.matchAll(RANGE_PATTERN)) {
		const start = match.index;
		const context = text.slice(Math.max(0, start - 120), start).toLocaleLowerCase('es');
		const categories = [...context.matchAll(/temperatura|humedad.{0,30}(?:aire|ambiente)|humedad.{0,30}(?:suelo|tierra)|\b(?:suelo|tierra)\b|(?:iluminaci[oó]n|luz)/g)];
		const category = categories.at(-1)?.[0] || '';
		const range = [parseRangeNumber(match[1]), parseRangeNumber(match[2])];
		if (!range.every(Number.isFinite) || range[0] > range[1]) continue;
		const unit = match[3].toLocaleLowerCase('es').replace(/\s/g, '');
		if ((unit === '°c' || unit === 'ºc') && category === 'temperatura' && !targets.temperatura_c) {
			targets.temperatura_c = range;
		} else if (unit === '%' && /(?:aire|ambiente)/.test(category) && !targets.humedad_ambiente_pct) {
			targets.humedad_ambiente_pct = range;
		} else if (unit === '%' && /(?:suelo|tierra)/.test(category) && !targets.humedad_suelo_pct) {
			targets.humedad_suelo_pct = range;
			targets.humedad_suelo_unidad = match[4] ? 'vwc' : 'sensor_pct';
		} else if ((unit === 'lux' || unit === 'lx') && /(?:iluminaci[oó]n|luz)/.test(category) && !targets.intensidad_luz_lux) {
			targets.intensidad_luz_lux = range;
		}
	}
	return targets;
}

function describeRange(range, unit) {
	return range ? { minimo: range[0], maximo: range[1], unidad: unit } : null;
}

function formatRange(range) {
	return range.map((value) => Number(value).toLocaleString('es-CO', { maximumFractionDigits: 2 })).join('–');
}

function textResult(value) {
	return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

function failureResult(error) {
	const status = error?.statusCode || error?.status;
	return {
		isError: true,
		content: [{ type: 'text', text: status === 404 ? 'No se encontró un proyecto disponible para esta sesión.' : 'No fue posible consultar esta información ahora.' }],
	};
}

async function queryRows(db, sql, params) {
	const [rows] = await db.execute(sql, params);
	return rows;
}

async function verifyActor(db, actorId, suppliedRole) {
	const id = Number(actorId);
	if (!Number.isInteger(id) || id <= 0) throw Object.assign(new Error('Actor inválido.'), { statusCode: 403 });
	const rows = await queryRows(db,
		`SELECT u.id, u.nombres, u.apellidos, u.id_institucion, i.nombre AS institucion,
			UPPER(r.nombre) AS rol
		 FROM tblh_usuarios u
		 JOIN tbld_roles r ON r.id = u.id_rol AND r.estado = 1
		 LEFT JOIN tbld_instituciones i ON i.id = u.id_institucion
		 WHERE u.id = ? AND u.estado = 1 LIMIT 1`,
		[id],
	);
	const actor = rows[0];
	if (!actor || !ALLOWED_ROLES.has(actor.rol) || actor.rol !== suppliedRole) {
		throw Object.assign(new Error('Actor no autorizado.'), { statusCode: 403 });
	}
	return actor;
}

async function verifyProject(db, actor, projectId) {
	const id = Number(projectId);
	if (!Number.isInteger(id) || id <= 0) throw Object.assign(new Error('Proyecto inválido.'), { statusCode: 404 });
	const rows = await queryRows(db,
		`SELECT p.id, p.nombre, p.descripcion, p.id_usuario, p.id_docente, p.id_planta,
			pl.nombre_comun AS planta, pl.descripcion AS planta_descripcion, p.fecha_inicio, p.fecha_fin, p.tipo_tierra,
			p.id_dispositivo, p.id_dispositivo_camara,
			u.nombres AS estudiante_nombres, u.apellidos AS estudiante_apellidos
		 FROM tblh_proyectos p
		 JOIN tbld_plantas pl ON pl.id = p.id_planta
		 JOIN tblh_usuarios u ON u.id = p.id_usuario AND u.estado = 1
		 WHERE p.id = ? AND p.estado = 1
			AND ((? = 'ESTUDIANTE' AND p.id_usuario = ?) OR (? = 'DOCENTE' AND p.id_docente = ?))
		 LIMIT 1`,
		[id, actor.rol, actor.id, actor.rol, actor.id],
	);
	if (!rows[0]) throw Object.assign(new Error('Proyecto fuera del alcance del actor.'), { statusCode: 404 });
	return rows[0];
}

function actorSchema() {
	return {};
}

async function readProjectReadings(db, projectId, days = 7) {
	return queryRows(db,
		`SELECT temperatura_c, humedad_ambiente_pct, humedad_suelo_pct, intensidad_luz_lux,
			DATE_FORMAT(fecha_registro, '%Y-%m-%d %H:%i:%s') AS fecha_lectura,
			TIMESTAMPDIFF(MINUTE, fecha_registro, NOW()) AS minutos
		 FROM tblh_registros_monitoreo
		 WHERE id_proyecto = ? AND estado = 1 AND fecha_registro >= ? AND fecha_registro <= NOW()
		 ORDER BY fecha_registro ASC LIMIT 2016`,
		[projectId, `${dateDaysAgo(days)} 00:00:00`],
	);
}

async function readProjectLogs(db, projectId, days = 7) {
	return queryRows(db,
		`SELECT DATE_FORMAT(fecha_bitacora, '%Y-%m-%d') AS fecha_bitacora,
			temperatura_ambiente_c, humedad_suelo_pct, agua_aplicada_ml, hora_riego,
			color_hojas, observacion, retos_completados
		 FROM tblh_bitacoras_diarias
		 WHERE id_proyecto = ? AND estado = 1 AND fecha_bitacora >= ? AND fecha_bitacora <= CURDATE()
		 ORDER BY fecha_bitacora DESC LIMIT 7`,
		[projectId, dateDaysAgo(days)],
	);
}

function aggregateReadings(readings) {
	const daily = new Map();
	for (const reading of readings) {
		const date = dateKey(reading.fecha_lectura);
		if (!date) continue;
		if (!daily.has(date)) daily.set(date, { fecha: date, cantidad_lecturas: 0, sums: Object.fromEntries(SENSOR_FIELDS.map((field) => [field, 0])), counts: Object.fromEntries(SENSOR_FIELDS.map((field) => [field, 0])) });
		const summary = daily.get(date);
		summary.cantidad_lecturas += 1;
		for (const field of SENSOR_FIELDS) {
			const value = numberOrNull(reading[field]);
			if (value === null) continue;
			summary.sums[field] += value;
			summary.counts[field] += 1;
		}
	}
	return [...daily.values()].map((day) => ({
		fecha: day.fecha,
		lecturas: day.cantidad_lecturas,
		...Object.fromEntries(SENSOR_FIELDS.map((field) => [field, day.counts[field] ? Math.round(day.sums[field] / day.counts[field] * 10) / 10 : null])),
	}));
}

function decodeChallenges(value) {
	if (Array.isArray(value)) return value.slice(0, 6);
	try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.slice(0, 6) : []; } catch { return []; }
}

function elapsedDays(date) {
	const key = dateKey(date);
	if (!key) return null;
	const today = toColombiaDate();
	const [year, month, day] = key.split('-').map(Number);
	const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
	return Math.floor((Date.UTC(todayYear, todayMonth - 1, todayDay) - Date.UTC(year, month - 1, day)) / 86400000);
}

function buildCareAlerts(project, readings, logs, targets = parsePlantTargets(project.planta_descripcion)) {
	if (project.fecha_fin) return [];
	const alerts = [];
	const latest = readings.at(-1);
	if (!project.id_dispositivo) alerts.push({ tipo: 'sin_sensor', nivel: 'observacion', mensaje: 'No hay sensor vinculado; usa también tus observaciones manuales.' });
	if (project.id_dispositivo && (!latest || numberOrNull(latest.minutos) > ALERTS.staleMinutes)) alerts.push({ tipo: 'sensor_sin_datos', nivel: 'atencion', mensaje: 'No hay lecturas recientes. Comprueba que el sensor tenga energía y conexión.' });
	if (latest && Number(latest.temperatura_c) === 0 && Number(latest.humedad_ambiente_pct) === 0) alerts.push({ tipo: 'sensor_ambiente_desconectado', nivel: 'atencion', mensaje: 'Temperatura y humedad del aire aparecen en cero; puede estar desconectado ese sensor.' });
	const soil = numberOrNull(latest?.humedad_suelo_pct);
	if (soil !== null && targets.humedad_suelo_unidad === 'vwc') {
		alerts.push({ tipo: 'humedad_suelo_requiere_calibracion', nivel: 'observacion', mensaje: `La referencia óptima del suelo para ${project.planta || 'esta planta'} está expresada como VWC y no se compara con el porcentaje relativo del sensor sin calibración.` });
	} else if (soil !== null) {
		const [soilMin, soilMax] = targets.humedad_suelo_pct || [ALERTS.drySoilPct, ALERTS.wetSoilPct];
		if (soil < soilMin) alerts.push({ tipo: 'suelo_seco', nivel: 'atencion', mensaje: `La humedad del suelo (${Math.round(soil)} %) está por debajo del rango de referencia (${formatRange([soilMin, soilMax])} %). Comprueba la tierra antes de regar.` });
		if (soil > soilMax) alerts.push({ tipo: 'suelo_humedo', nivel: 'observacion', mensaje: `La humedad del suelo (${Math.round(soil)} %) supera el rango de referencia (${formatRange([soilMin, soilMax])} %); espera y vuelve a comprobar antes de regar.` });
	}
	const temperature = numberOrNull(latest?.temperatura_c);
	const [temperatureMin, temperatureMax] = targets.temperatura_c || [ALERTS.coldAirC, ALERTS.hotAirC];
	if (temperature !== null && temperature > 0 && temperature < temperatureMin) alerts.push({ tipo: 'temperatura_baja', nivel: 'observacion', mensaje: `La temperatura (${temperature.toFixed(1)} °C) está por debajo del rango de referencia para ${project.planta || 'esta planta'} (${formatRange([temperatureMin, temperatureMax])} °C).` });
	if (temperature !== null && temperature > temperatureMax) alerts.push({ tipo: 'temperatura_alta', nivel: 'atencion', mensaje: `La temperatura (${temperature.toFixed(1)} °C) supera el rango de referencia para ${project.planta || 'esta planta'} (${formatRange([temperatureMin, temperatureMax])} °C). Observa las hojas y, si muestran estrés, ofrece sombra.` });
	const ambientHumidity = numberOrNull(latest?.humedad_ambiente_pct);
	const [airHumidityMin, airHumidityMax] = targets.humedad_ambiente_pct || [];
	if (ambientHumidity !== null && !isAmbientSensorOff(latest) && airHumidityMin !== undefined && ambientHumidity < airHumidityMin) {
		alerts.push({ tipo: 'humedad_aire_baja', nivel: 'observacion', mensaje: `La humedad relativa del aire (${Math.round(ambientHumidity)} %) está por debajo del rango de referencia para ${project.planta || 'esta planta'} (${formatRange([airHumidityMin, airHumidityMax])} %).` });
	}
	if (ambientHumidity !== null && !isAmbientSensorOff(latest) && airHumidityMax !== undefined && ambientHumidity > airHumidityMax) {
		alerts.push({ tipo: 'humedad_aire_alta', nivel: 'observacion', mensaje: `La humedad relativa del aire (${Math.round(ambientHumidity)} %) supera el rango de referencia para ${project.planta || 'esta planta'} (${formatRange([airHumidityMin, airHumidityMax])} %).` });
	}
	const light = numberOrNull(latest?.intensidad_luz_lux);
	const [lightMin, lightMax] = targets.intensidad_luz_lux || [];
	if (light !== null && lightMin !== undefined && light < lightMin) {
		alerts.push({ tipo: 'luz_baja', nivel: 'observacion', mensaje: `La iluminación (${Math.round(light)} lux) está por debajo del rango de referencia para ${project.planta || 'esta planta'} (${formatRange([lightMin, lightMax])} lux).` });
	}
	if (light !== null && lightMax !== undefined && light > lightMax) {
		alerts.push({ tipo: 'luz_alta', nivel: 'observacion', mensaje: `La iluminación (${Math.round(light)} lux) supera el rango de referencia para ${project.planta || 'esta planta'} (${formatRange([lightMin, lightMax])} lux). Comprueba si el sensor recibe luz directa.` });
	}
	const latestLog = logs[0]?.fecha_bitacora || project.fecha_inicio;
	const elapsed = elapsedDays(latestLog);
	if (elapsed !== null && elapsed >= ALERTS.missingLogDays) alerts.push({ tipo: 'bitacora_pendiente', nivel: 'observacion', mensaje: 'Hace varios días que no hay una observación. Registra cómo encuentras la planta hoy.' });
	return alerts;
}

function registerGuardianTools(server, { z, db, getActor }) {
	if (!db || typeof db.execute !== 'function') throw new Error('MCP necesita un pool SQL compatible.');
	if (typeof getActor !== 'function') throw new Error('MCP necesita identidad autenticada por sesión.');
	const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
	const register = (name, title, description, inputSchema, action) => {
		server.registerTool(name, { title, description, inputSchema, annotations }, async (args) => {
			try {
				const actor = await getActor();
				return textResult(await action(actor, args));
			} catch (error) {
				console.error(`[MCP] Tool ${name} failed (${error?.code || error?.statusCode || error?.name || 'Error'}).`);
				return failureResult(error);
			}
		});
	};

	register('get_my_profile', 'Mi perfil', 'Úsala si preguntan el nombre, rol o institución de la sesión autenticada. No devuelve contraseñas ni correo.', actorSchema(), async (actor) => ({
		nombre: [actor.nombres, actor.apellidos].filter(Boolean).join(' ') || null,
		rol: actor.rol,
		institucion: actor.institucion || null,
	}));

	register('list_my_projects', 'Mis proyectos', 'Úsala para contar o enumerar los proyectos activos del estudiante autenticado o asignados al docente. La cantidad es el número de elementos devueltos; el máximo es 20.', actorSchema(), async (actor) => {
		const rows = await queryRows(db,
			`SELECT p.id, p.nombre, pl.nombre_comun AS planta, p.fecha_inicio, p.fecha_fin,
				CASE WHEN ? = 'DOCENTE' THEN CONCAT(u.nombres, ' ', u.apellidos) ELSE NULL END AS estudiante
			 FROM tblh_proyectos p
			 JOIN tbld_plantas pl ON pl.id = p.id_planta
			 JOIN tblh_usuarios u ON u.id = p.id_usuario AND u.estado = 1
			 WHERE p.estado = 1 AND ((? = 'ESTUDIANTE' AND p.id_usuario = ?) OR (? = 'DOCENTE' AND p.id_docente = ?))
			 ORDER BY p.fecha_registro DESC LIMIT 20`,
			[actor.rol, actor.rol, actor.id, actor.rol, actor.id],
		);
		return {
			cantidad_proyectos: rows.length,
			proyectos: rows.map((project) => ({ project_id: Number(project.id), nombre: project.nombre, planta: project.planta, estudiante: project.estudiante, fecha_inicio: dateKey(project.fecha_inicio), finalizado: Boolean(project.fecha_fin) })),
		};
	});

	const projectTools = { ...actorSchema(), project_id: z.number().int().positive().describe('ID del proyecto activo visible para este actor; el MCP vuelve a verificar el acceso.') };
	const recentTools = { ...projectTools, days: z.number().int().min(1).max(7).optional().describe('Número de días recientes que se consultan; debe estar entre 1 y 7.') };

	register('get_project_overview', 'Resumen de proyecto', 'Úsala para confirmar detalles actuales del proyecto, la descripción y rangos de referencia de la planta, fecha, tipo de tierra, si hay sensor/cámara vinculados y la última lectura disponible. No infieras una lectura si devuelve null.', projectTools, async (actor, { project_id }) => {
		const project = await verifyProject(db, actor, project_id);
		const [latest] = await queryRows(db,
			`SELECT temperatura_c, humedad_ambiente_pct, humedad_suelo_pct, intensidad_luz_lux,
				DATE_FORMAT(fecha_registro, '%Y-%m-%d %H:%i:%s') AS fecha_lectura
			 FROM tblh_registros_monitoreo WHERE id_proyecto = ? AND estado = 1
			 ORDER BY fecha_registro DESC LIMIT 1`, [project.id]);
		return {
			proyecto: { id: Number(project.id), nombre: project.nombre, planta: project.planta, descripcion: project.descripcion, descripcion_planta: project.planta_descripcion || null, tipo_tierra: project.tipo_tierra, fecha_inicio: dateKey(project.fecha_inicio), finalizado: Boolean(project.fecha_fin), sensor_vinculado: Boolean(project.id_dispositivo), camara_vinculada: Boolean(project.id_dispositivo_camara), ...(actor.rol === 'DOCENTE' ? { estudiante: `${project.estudiante_nombres} ${project.estudiante_apellidos}`.trim() } : {}) },
			rangos_optimos_planta: parsePlantTargets(project.planta_descripcion),
			ultima_lectura: latest || null,
		};
	});

	register('get_sensor_trends', 'Tendencias de sensores', 'Úsala para consultar promedios diarios históricos de temperatura, humedad del aire/suelo y luz. Devuelve solo días con lecturas; un arreglo vacío significa que no hay datos en el periodo consultado.', recentTools, async (actor, { project_id, days = 7 }) => {
		const project = await verifyProject(db, actor, project_id);
		const readings = await queryRows(db,
			`SELECT temperatura_c, humedad_ambiente_pct, humedad_suelo_pct, intensidad_luz_lux,
				DATE_FORMAT(fecha_registro, '%Y-%m-%d %H:%i:%s') AS fecha_lectura
			 FROM tblh_registros_monitoreo WHERE id_proyecto = ? AND estado = 1
				AND fecha_registro >= ? AND fecha_registro <= NOW()
			 ORDER BY fecha_registro ASC LIMIT 2016`, [project.id, `${dateDaysAgo(days)} 00:00:00`]);
		return { periodo_dias: days, dias: aggregateReadings(readings) };
	});

	register('get_care_logs', 'Bitácoras recientes', 'Úsala para consultar registros manuales: riego, color de hojas, observaciones y retos de los últimos 1 a 7 días. Un arreglo vacío significa que no hay bitácoras en ese periodo.', recentTools, async (actor, { project_id, days = 7 }) => {
		const project = await verifyProject(db, actor, project_id);
		const rows = await queryRows(db,
			`SELECT DATE_FORMAT(fecha_bitacora, '%Y-%m-%d') AS fecha_bitacora,
				temperatura_ambiente_c, humedad_suelo_pct, agua_aplicada_ml, hora_riego,
				color_hojas, observacion, retos_completados
			 FROM tblh_bitacoras_diarias WHERE id_proyecto = ? AND estado = 1
				AND fecha_bitacora >= ? AND fecha_bitacora <= CURDATE()
			 ORDER BY fecha_bitacora DESC LIMIT 7`, [project.id, dateDaysAgo(days)]);
		return { periodo_dias: days, registros: rows.map((row) => ({
			fecha: dateKey(row.fecha_bitacora),
			temperatura_ambiente_c: numberOrNull(row.temperatura_ambiente_c),
			humedad_suelo_pct: numberOrNull(row.humedad_suelo_pct),
			agua_aplicada_ml: numberOrNull(row.agua_aplicada_ml),
			hora_riego: row.hora_riego || null,
			color_hojas: String(row.color_hojas || '').slice(0, 50) || null,
			observacion: String(row.observacion || '').slice(0, 500),
			retos_completados: decodeChallenges(row.retos_completados),
		})) };
	});

	register('get_care_alerts', 'Alertas de cuidado', 'Úsala cuando pregunten qué revisar, si hay riesgos o señales de cuidado. Compara las lecturas recientes con los rangos que estén presentes en la descripción de la planta. Si falta un rango, no lo inventes; solo temperatura y suelo tienen referencias generales de respaldo. Informa si la humedad del suelo está en VWC y no compares esa unidad con el porcentaje del sensor sin calibración. También revisa bitácoras y conexión; nunca modifica dispositivos.', projectTools, async (actor, { project_id }) => {
		const project = await verifyProject(db, actor, project_id);
		const targets = parsePlantTargets(project.planta_descripcion);
		const [readings, logs] = await Promise.all([
			queryRows(db, `SELECT temperatura_c, humedad_ambiente_pct, humedad_suelo_pct, intensidad_luz_lux,
				DATE_FORMAT(fecha_registro, '%Y-%m-%d %H:%i:%s') AS fecha_lectura,
				TIMESTAMPDIFF(MINUTE, fecha_registro, NOW()) AS minutos
				FROM tblh_registros_monitoreo WHERE id_proyecto = ? AND estado = 1 AND fecha_registro >= ?
				ORDER BY fecha_registro ASC LIMIT 2016`, [project.id, `${dateDaysAgo(7)} 00:00:00`]),
			queryRows(db, `SELECT DATE_FORMAT(fecha_bitacora, '%Y-%m-%d') AS fecha_bitacora
				FROM tblh_bitacoras_diarias WHERE id_proyecto = ? AND estado = 1 ORDER BY fecha_bitacora DESC LIMIT 1`, [project.id]),
		]);
		return {
			proyecto: project.nombre,
			planta: project.planta,
			rangos_optimos: {
				temperatura_c: describeRange(targets.temperatura_c || [ALERTS.coldAirC, ALERTS.hotAirC], '°C'),
				humedad_ambiente_pct: describeRange(targets.humedad_ambiente_pct, '%'),
				humedad_suelo_pct: describeRange(targets.humedad_suelo_pct, targets.humedad_suelo_unidad === 'vwc' ? '% VWC' : '% sensor'),
				intensidad_luz_lux: describeRange(targets.intensidad_luz_lux, 'lux'),
			},
			origen_rangos: targets.temperatura_c || targets.humedad_ambiente_pct || targets.humedad_suelo_pct || targets.intensidad_luz_lux ? 'descripcion_de_planta' : 'referencias_generales',
			alertas: buildCareAlerts(project, readings, logs, targets),
		};
	});

	register('get_learning_context', 'Progreso de aprendizaje', 'Úsala para preguntas sobre aprendizaje, cuestionarios y resultados por tema del estudiante dueño del proyecto autorizado. Un arreglo vacío significa que no hay resultados disponibles.', projectTools, async (actor, { project_id }) => {
		const project = await verifyProject(db, actor, project_id);
		const rows = await queryRows(db,
			`SELECT t.nombre AS tema, COUNT(r.id) AS respuestas, COALESCE(SUM(r.es_correcta), 0) AS correctas
			 FROM tblh_respuestas r
			 JOIN tblh_intentos i ON i.id = r.id_intento
			 JOIN tblh_cuestionarios c ON c.id = i.id_cuestionario AND c.estado = 1
			 JOIN tblh_preguntas p ON p.id = r.id_pregunta
			 JOIN tbld_temas t ON t.id = p.id_tema
			 WHERE i.id_estudiante = ? AND (c.id_docente = ? OR (? IS NULL AND c.id_docente IS NULL))
			 GROUP BY t.id, t.nombre, t.orden ORDER BY t.orden LIMIT 12`,
			[project.id_usuario, project.id_docente, project.id_docente],
		);
		return { temas: rows.map((row) => ({ tema: row.tema, respuestas: Number(row.respuestas) || 0, porcentaje: Number(row.respuestas) ? Math.round(Number(row.correctas) / Number(row.respuestas) * 100) : null })) };
	});
}

module.exports = { registerGuardianTools, verifyActor, verifyProject, aggregateReadings, parsePlantTargets, buildCareAlerts, dateDaysAgo };