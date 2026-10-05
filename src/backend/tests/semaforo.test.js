const assert = require('node:assert/strict');
const test = require('node:test');
require('./helpers');
const { evaluate } = require('../services/semaforo');
const lecturasService = require('../services/lecturas.service');

const baseRow = {
	fecha_fin: null,
	id_dispositivo: 8,
	id_dispositivo_camara: null,
	sensor_minutos_sin_contacto: 5,
	camara_minutos_sin_contacto: null,
	dias_sin_bitacora: 0,
	ultima_bitacora: '2026-09-26',
	retos_hoy: JSON.stringify(['color', 'crecer', 'compost', 'riego', 'plagas', 'foto']),
};
const healthyReading = { temperatura_c: '24.00', humedad_ambiente_pct: '60.00', humedad_suelo_pct: '55.00', intensidad_luz_lux: '300.00', minutos: 5 };
const codes = (result) => result.alertas.map((alert) => alert.codigo);

test('proyecto al día y con lecturas normales queda en verde', () => {
	const result = evaluate(baseRow, [healthyReading, healthyReading, healthyReading]);
	assert.equal(result.nivel, 'verde');
	assert.deepEqual(result.alertas, []);
});

test('proyecto finalizado no genera alertas', () => {
	assert.deepEqual(evaluate({ ...baseRow, fecha_fin: '2026-09-20' }, []), { nivel: 'finalizado', alertas: [] });
});

test('tres días sin bitácora es rojo y no duplica el aviso de retos', () => {
	const result = evaluate({ ...baseRow, dias_sin_bitacora: 3, retos_hoy: null }, [healthyReading]);
	assert.equal(result.nivel, 'rojo');
	assert.ok(codes(result).includes('sin_bitacora'));
	assert.ok(!codes(result).includes('retos_incompletos'));
});

test('suelo seco en una lectura vigente marca planta en riesgo', () => {
	const result = evaluate(baseRow, [{ ...healthyReading, humedad_suelo_pct: '20.00' }]);
	assert.equal(result.nivel, 'rojo');
	assert.match(result.alertas[0].mensaje, /suelo seco/);
});

test('temperatura y humedad del aire en 0 se tratan como sensor desconectado, no como frío', () => {
	const dhtOff = { ...healthyReading, temperatura_c: '0.00', humedad_ambiente_pct: '0.00', humedad_suelo_pct: '98.00' };
	const result = evaluate(baseRow, [dhtOff, dhtOff, dhtOff]);
	assert.ok(codes(result).includes('sensor_desconectado'));
	assert.ok(!codes(result).includes('planta_riesgo'));
	assert.equal(result.nivel, 'naranja');
});

test('sensor sin contacto reciente es naranja; sin sensor vinculado es amarillo', () => {
	assert.ok(codes(evaluate({ ...baseRow, sensor_minutos_sin_contacto: 90 }, [healthyReading])).includes('sin_conexion'));
	const withoutSensor = evaluate({ ...baseRow, id_dispositivo: null }, []);
	assert.equal(withoutSensor.nivel, 'amarillo');
	assert.ok(codes(withoutSensor).includes('sin_sensor'));
});

test('lectura antigua no se usa para decidir riesgo', () => {
	const result = evaluate({ ...baseRow, sensor_minutos_sin_contacto: 3000 }, [{ ...healthyReading, humedad_suelo_pct: '5.00', minutos: 3000 }]);
	assert.ok(!codes(result).includes('planta_riesgo'));
});

test('retos incompletos hoy es amarillo', () => {
	const result = evaluate({ ...baseRow, retos_hoy: JSON.stringify(['color']) }, [healthyReading]);
	assert.equal(result.nivel, 'amarillo');
	assert.match(result.alertas[0].mensaje, /1\/6/);
});

test('el historial oculta los ceros de sensores desconectados sin inventar valores', () => {
	const cleaned = lecturasService.clean({ temperatura_c: '0.00', humedad_ambiente_pct: '0.00', humedad_suelo_pct: '98.00', intensidad_luz_lux: '0.00' });
	assert.equal(cleaned.temperatura_c, null);
	assert.equal(cleaned.humedad_suelo_pct, '98.00');
	assert.equal(cleaned.sensor_ambiente_desconectado, true);
	const allZero = lecturasService.clean({ temperatura_c: '0.00', humedad_ambiente_pct: '0.00', humedad_suelo_pct: '0.00', intensidad_luz_lux: '0.00' });
	assert.equal(allZero.sensor_desconectado, true);
	assert.equal(allZero.humedad_suelo_pct, null);
});
