// Plataforma: login, sesión, aislamiento entre usuarios, bitácoras, panel docente, dispositivos de sensores.
import { createReport, login, call, uniqueMac, PROVISIONING_KEY, todayLocal } from './_lib.mjs';

export default async function run() {
	const report = createReport('Plataforma (estudiante, docente, sensores)');
	const { check } = report;
	const student = await login('dpaniagua');
	const teacher = await login('marruiz');
	const other = await login('juan.tamayo');
	check('login estudiante → estudiante.html', student.status === 200 && student.body.redirect === '/estudiante.html');
	check('login docente → docente.html', teacher.status === 200 && teacher.body.redirect === '/docente.html');
	check('contraseña errada → 401', (await login('dpaniagua', 'mal')).status === 401);

	const me = await call(student.cookie, '/api/auth/me');
	check('/api/auth/me', me.body?.rol === 'ESTUDIANTE', `${me.body?.nombres} · ${me.body?.institucion}`);
	check('/api/config ya no entrega la clave', JSON.stringify((await call(null, '/api/config')).body) === '{}');

	const projects = await call(student.cookie, '/api/proyectos');
	check('proyectos del estudiante', projects.status === 200 && projects.body.length > 0, projects.body?.map((project) => project.nombre).join(', '));
	check('resumen del proyecto propio', (await call(student.cookie, '/api/proyectos/resumen/2')).status === 200);
	check('historial de lecturas', (await call(student.cookie, '/api/proyectos/resumen/2/lecturas')).status === 200);
	check('otro estudiante no ve el resumen (404)', (await call(other.cookie, '/api/proyectos/resumen/2')).status === 404);
	check('usuario_id falso se ignora', (await call(other.cookie, '/api/proyectos?usuario_id=1')).body.every((project) => project.id_usuario !== 1));
	check('sin sesión → 401', (await call(null, '/api/monitoreo/bitacoras?id_proyecto=2')).status === 401);
	check('DELETE de dispositivo sin credenciales → 401', (await call(null, '/api/dispositivos/proyectos/2', { method: 'DELETE' })).status === 401);
	check('ruta /api inexistente → 404 JSON', (await call(student.cookie, '/api/no-existe')).status === 404);

	const emoji = await call(student.cookie, '/api/monitoreo/bitacoras', { method: 'POST', body: { id_proyecto: 7, fecha_bitacora: todayLocal(), observacion: `Prueba ${Date.now()} 🌱`, retos_completados: ['color'] } });
	check('bitácora con emoji (utf8mb4)', emoji.status === 201);
	check('emoji guardado intacto', (await call(student.cookie, '/api/monitoreo/bitacoras?id_proyecto=7')).body.some((log) => String(log.observacion).includes('🌱')));
	check('el docente no escribe bitácoras (403)', (await call(teacher.cookie, '/api/monitoreo/bitacoras', { method: 'POST', body: { id_proyecto: 7, fecha_bitacora: todayLocal() } })).status === 403);

	const panel = await call(teacher.cookie, '/api/docente/proyectos?estado=todos');
	check('panel docente con semáforo', panel.status === 200 && panel.body.every((project) => project.nivel), panel.body?.map((project) => `${project.id}:${project.nivel}`).join(' '));
	check('indicadores docente', (await call(teacher.cookie, '/api/docente/resumen')).status === 200);
	const csv = await call(teacher.cookie, '/api/docente/exportar.csv');
	check('CSV con BOM UTF-8', csv.status === 200 && csv.buffer[0] === 0xef && csv.buffer[1] === 0xbb && csv.buffer[2] === 0xbf);
	check('el estudiante no entra al panel docente (403)', (await call(student.cookie, '/api/docente/resumen')).status === 403);

	check('docente finaliza el proyecto 7', (await call(teacher.cookie, '/api/docente/proyectos/7/finalizar', { method: 'POST' })).status === 200);
	check('estudiante no registra en proyecto finalizado (403)', (await call(student.cookie, '/api/monitoreo/bitacoras', { method: 'POST', body: { id_proyecto: 7, fecha_bitacora: todayLocal() } })).status === 403);
	check('docente reabre el proyecto 7', (await call(teacher.cookie, '/api/docente/proyectos/7/reabrir', { method: 'POST' })).status === 200);

	// ESP32 de sensores: provisión → vinculación → lectura → configuración → OTA → desvincular
	const mac = uniqueMac(1);
	const provision = await call(null, '/api/dispositivos/provisionar', { method: 'POST', headers: { 'x-provisioning-key': PROVISIONING_KEY }, body: { mac_address: mac, modelo: 'ESP32', version_firmware: '1.0.1' } });
	check('provisión ESP32 de sensores', provision.status === 201 && provision.body?.api_key, `${provision.body?.codigo_interno}`);
	const key = { 'x-device-key': provision.body.api_key };
	await call(student.cookie, '/api/dispositivos/proyectos/7', { method: 'DELETE' });
	const link = await call(student.cookie, '/api/dispositivos/proyectos/7/vincular', { method: 'POST', body: { codigo_interno: provision.body.codigo_interno, codigo_vinculacion: provision.body.codigo_vinculacion, tipo_dispositivo: 'sensor', configuracion_led: 'media', color_led: 'azul', brillo_led: 128, tipo_tierra: 'franca' } });
	check('vincular sensor al proyecto 7', link.status === 200, JSON.stringify(link.body));
	check('lectura del ESP32 (201)', (await call(null, '/api/monitoreo/lecturas', { method: 'POST', headers: key, body: { fecha_lectura: '2026-09-27 14:00:00', temperatura_c: 22.5, humedad_ambiente_pct: 70, humedad_suelo_pct: 25, intensidad_luz_lux: 300 } })).status === 201);
	check('configuración para el ESP32', (await call(null, '/api/dispositivos/configuracion', { headers: key })).body?.proyecto_id === 7);
	check('OTA del sensor (200)', (await call(null, '/api/firmware/latest', { headers: key })).status === 200);
	const semaforo = (await call(teacher.cookie, '/api/docente/proyectos')).body.find((project) => project.id === 7);
	check('semáforo detecta suelo seco', semaforo?.alertas.some((alert) => alert.codigo === 'planta_riesgo'));
	check('docente desvincula el sensor', (await call(teacher.cookie, '/api/dispositivos/proyectos/7', { method: 'DELETE' })).status === 200);
	return report.print();
}

if (import.meta.url === `file:///${process.argv[1].replaceAll('\\', '/')}`) run().then((failed) => process.exit(failed ? 1 : 0));
