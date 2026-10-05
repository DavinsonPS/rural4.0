const { SEMAFORO, RETOS } = require('../config/catalogos');
const { isAllZero, isAmbientSensorOff } = require('./lecturas.service');

// Semáforo del panel docente: decide qué proyectos necesitan atención y por qué.
// Función pura (sin BD) para poder probarla con datos simulados.

const LEVEL_ORDER = ['verde', 'amarillo', 'naranja', 'rojo'];

function parseChallenges(value) {
	try {
		const parsed = typeof value === 'string' ? JSON.parse(value) : value;
		return Array.isArray(parsed) ? [...new Set(parsed.filter((challenge) => RETOS.includes(challenge)))] : [];
	} catch {
		return [];
	}
}

function formatMinutes(minutes) {
	if (minutes < 60) return `${minutes} min`;
	if (minutes < 60 * 48) return `${Math.round(minutes / 60)} h`;
	return `${Math.round(minutes / 1440)} días`;
}

function isNull(value) {
	return value === null || value === undefined;
}

// row: fila de proyectosRepo.listForTeacherPanel. readings: lecturas más recientes primero.
function evaluate(row, readings = [], config = SEMAFORO) {
	if (row.fecha_fin) return { nivel: 'finalizado', alertas: [] };
	const alerts = [];
	const add = (nivel, codigo, mensaje) => alerts.push({ nivel, codigo, mensaje });

	const daysWithoutLog = Number(row.dias_sin_bitacora);
	if (Number.isFinite(daysWithoutLog) && daysWithoutLog >= config.DIAS_SIN_BITACORA) {
		add('rojo', 'sin_bitacora', row.ultima_bitacora ? `${daysWithoutLog} días sin bitácora` : 'Aún no registra bitácoras');
	}

	if (!row.id_dispositivo) {
		add('amarillo', 'sin_sensor', 'Sin ESP32 de sensores vinculado');
	} else {
		const minutes = row.sensor_minutos_sin_contacto;
		if (isNull(minutes)) add('naranja', 'sin_conexion', 'El sensor aún no se ha conectado');
		else if (Number(minutes) > config.SENSOR_SIN_CONEXION_MIN) add('naranja', 'sin_conexion', `Sensor sin conexión hace ${formatMinutes(Number(minutes))}`);

		const lastReadings = readings.slice(0, config.LECTURAS_EN_CERO_SEGUIDAS);
		if (lastReadings.length >= config.LECTURAS_EN_CERO_SEGUIDAS && lastReadings.every(isAmbientSensorOff)) {
			add('naranja', 'sensor_desconectado', `Las últimas ${lastReadings.length} lecturas llegan en 0: revisa la conexión de los sensores`);
		}

		const current = readings.find((reading) => !isAllZero(reading) && !isNull(reading.minutos) && Number(reading.minutos) <= config.LECTURA_VIGENTE_MIN);
		if (current) {
			const risks = [];
			const soil = Number(current.humedad_suelo_pct);
			if (!isNull(current.humedad_suelo_pct) && Number.isFinite(soil) && soil < config.HUMEDAD_SUELO_MIN) risks.push(`suelo seco (${Math.round(soil)} %)`);
			const temperature = Number(current.temperatura_c);
			if (!isAmbientSensorOff(current) && !isNull(current.temperatura_c) && Number.isFinite(temperature)) {
				if (temperature < config.TEMPERATURA_MIN) risks.push(`temperatura baja (${temperature.toFixed(1)} °C)`);
				if (temperature > config.TEMPERATURA_MAX) risks.push(`temperatura alta (${temperature.toFixed(1)} °C)`);
			}
			if (risks.length) add('rojo', 'planta_riesgo', `Planta en riesgo: ${risks.join(', ')}`);
		}
	}

	if (row.id_dispositivo_camara) {
		const minutes = row.camara_minutos_sin_contacto;
		if (isNull(minutes)) add('naranja', 'camara_sin_conexion', 'La cámara aún no ha enviado fotos');
		else if (Number(minutes) > config.CAMARA_SIN_CONEXION_MIN) add('naranja', 'camara_sin_conexion', `Cámara sin conexión hace ${formatMinutes(Number(minutes))}`);
	}

	const challengesToday = parseChallenges(row.retos_hoy).length;
	if (!(daysWithoutLog >= config.DIAS_SIN_BITACORA) && challengesToday < RETOS.length) {
		add('amarillo', 'retos_incompletos', `${challengesToday}/${RETOS.length} retos hoy`);
	}

	const nivel = alerts.reduce((highest, alert) => (LEVEL_ORDER.indexOf(alert.nivel) > LEVEL_ORDER.indexOf(highest) ? alert.nivel : highest), 'verde');
	alerts.sort((first, second) => LEVEL_ORDER.indexOf(second.nivel) - LEVEL_ORDER.indexOf(first.nivel));
	return { nivel, alertas: alerts };
}

module.exports = { evaluate, parseChallenges, LEVEL_ORDER };
