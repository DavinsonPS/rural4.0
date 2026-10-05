// Regresión: misma petición a la versión ORIGINAL (3001, commit b1b04fb) y a la NUEVA (3000),
// contra la misma base de datos. Compara códigos HTTP, forma y valores de las respuestas.
import fs from 'node:fs';
import { uniqueMac } from './_lib.mjs';
// Requiere la versión original corriendo en el puerto 3001 (ver local/README.md, sección Regresión).
const ORIG = 'http://localhost:3001';
const NEW = 'http://localhost:3000';
const REG = { 'x-registration-key': 'registro-local' };
const PROV = { 'x-provisioning-key': 'provision-local' };
const rows = [];
const record = (area, name, verdict, detail = '') => rows.push({ area, name, verdict, detail });

async function req(base, path, { method = 'GET', headers = {}, body, raw } = {}) {
	const init = { method, headers: { ...headers }, redirect: 'manual' };
	if (raw) { init.body = raw; init.headers['content-type'] = 'image/jpeg'; }
	else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
	const response = await fetch(`${base}${path}`, init);
	const type = response.headers.get('content-type') || '';
	const buffer = Buffer.from(await response.arrayBuffer());
	let json = null;
	if (type.includes('json')) { try { json = JSON.parse(buffer.toString('utf8')); } catch {} }
	return { status: response.status, type, json, size: buffer.length, cookie: response.headers.get('set-cookie'), location: response.headers.get('location') };
}

const shape = (value) => (Array.isArray(value) ? [value.length ? shape(value[0]) : '[]'] : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, shape(value[key])])) : typeof value);
function diff(a, b, path = '', out = []) {
	if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) { out.push(`${path || '·'}: ${JSON.stringify(a)?.slice(0, 40)} ≠ ${JSON.stringify(b)?.slice(0, 40)}`); return out; }
	if (a && typeof a === 'object') {
		for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
			if (!(key in b)) out.push(`${path}.${key}: falta en la nueva`);
			else if (!(key in a)) out.push(`${path}.${key}: campo nuevo`);
			else diff(a[key], b[key], `${path}.${key}`, out);
		}
	} else if (a !== b) out.push(`${path || '·'}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
	return out;
}
function compare(area, name, original, updated, { ignore = [], expect } = {}) {
	if (original.status !== updated.status) { record(area, name, expect === 'status' ? 'CAMBIO ESPERADO' : 'DIFERENTE', `HTTP ${original.status} → ${updated.status}`); return; }
	if (original.json === null && updated.json === null) { record(area, name, original.size === updated.size ? 'IGUAL' : 'DIFERENTE', `HTTP ${original.status}, ${original.size} bytes → ${updated.size}`); return; }
	const differences = diff(original.json, updated.json).filter((line) => !ignore.some((pattern) => line.includes(pattern)));
	const onlyNewFields = differences.every((line) => line.endsWith('campo nuevo'));
	record(area, name, !differences.length ? 'IGUAL' : onlyNewFields ? 'IGUAL + campos nuevos' : 'DIFERENTE', differences.slice(0, 4).join(' | '));
}
async function both(path, options = {}, newOptions = options) { return [await req(ORIG, path, options), await req(NEW, path, newOptions)]; }

const SAMPLE_JPEG = fs.readFileSync(new URL('../../src/backend/uploads/photos/2026/09/2_2026-09-19T21-56-42-054Z_c5060536.jpg', import.meta.url));

// ---------- Firmware / ESP32 ----------
const provisioned = {};
for (const [label, base, mac] of [['orig', ORIG, uniqueMac(20)], ['new', NEW, uniqueMac(21)]]) {
	provisioned[label] = { first: await req(base, '/api/dispositivos/provisionar', { method: 'POST', headers: PROV, body: { mac_address: mac, modelo: 'ESP32', version_firmware: '1.0.1' } }) };
	provisioned[label].again = await req(base, '/api/dispositivos/provisionar', { method: 'POST', headers: PROV, body: { mac_address: mac, modelo: 'ESP32', version_firmware: '1.0.1' } });
	provisioned[label].camera = await req(base, '/api/dispositivos/provisionar', { method: 'POST', headers: PROV, body: { mac_address: uniqueMac(label === 'orig' ? 22 : 23), modelo: 'ESP32-CAMERA' } });
}
const keysOnly = (r) => ({ ...r, json: shape(r.json) });
compare('Firmware', 'POST /provisionar (nuevo)', keysOnly(provisioned.orig.first), keysOnly(provisioned.new.first));
compare('Firmware', 'POST /provisionar (reprovisión)', keysOnly(provisioned.orig.again), keysOnly(provisioned.new.again));
record('Firmware', 'reprovisión conserva código de vinculación', provisioned.new.again.json.codigo_vinculacion === provisioned.new.first.json.codigo_vinculacion ? 'IGUAL' : 'DIFERENTE');
compare('Firmware', 'POST /provisionar sin clave', ...(await both('/api/dispositivos/provisionar', { method: 'POST', body: { mac_address: 'X' } })));

const key = { orig: provisioned.orig.again.json.api_key, new: provisioned.new.again.json.api_key };
const cam = { orig: provisioned.orig.camera.json, new: provisioned.new.camera.json };
const dev = (label) => ({ 'x-device-key': key[label] });
compare('Firmware', 'GET /configuracion (sin vincular)', await req(ORIG, '/api/dispositivos/configuracion', { headers: dev('orig') }), await req(NEW, '/api/dispositivos/configuracion', { headers: dev('new') }), { ignore: ['dispositivo_id', 'codigo_interno'] });
compare('Firmware', 'POST /lecturas sin vincular', await req(ORIG, '/api/monitoreo/lecturas', { method: 'POST', headers: dev('orig'), body: {} }), await req(NEW, '/api/monitoreo/lecturas', { method: 'POST', headers: dev('new'), body: {} }));
compare('Firmware', 'GET /configuracion clave inválida', ...(await both('/api/dispositivos/configuracion', { headers: { 'x-device-key': 'no-existe' } })));

const reading = { fecha_lectura: '2026-09-27 16:00:00', temperatura_c: 23.5, humedad_ambiente_pct: 66, humedad_suelo_pct: 55, intensidad_luz_lux: 210 };
const results = {};
for (const [label, base] of [['orig', ORIG], ['new', NEW]]) {
	const p = provisioned[label].again.json;
	const r = {};
	r.link = await req(base, '/api/dispositivos/proyectos/7/vincular', { method: 'POST', headers: REG, body: { codigo_interno: p.codigo_interno, codigo_vinculacion: p.codigo_vinculacion, tipo_dispositivo: 'sensor', configuracion_led: 'media', color_led: 'azul', brillo_led: 128, tipo_tierra: 'franca' } });
	r.linkCam = await req(base, '/api/dispositivos/proyectos/7/vincular', { method: 'POST', headers: REG, body: { codigo_interno: cam[label].codigo_interno, codigo_vinculacion: cam[label].codigo_vinculacion, tipo_dispositivo: 'camara' } });
	r.config = await req(base, '/api/dispositivos/configuracion', { headers: dev(label) });
	r.reading = await req(base, '/api/monitoreo/lecturas', { method: 'POST', headers: dev(label), body: reading });
	r.readingBad = await req(base, '/api/monitoreo/lecturas', { method: 'POST', headers: dev(label), body: { ...reading, temperatura_c: 80 } });
	r.sensorPhoto = await req(base, '/api/monitoreo/fotografias', { method: 'POST', headers: dev(label), raw: SAMPLE_JPEG });
	r.camPhoto = await req(base, '/api/monitoreo/fotografias', { method: 'POST', headers: { 'x-device-key': cam[label].api_key }, raw: SAMPLE_JPEG });
	r.camReading = await req(base, '/api/monitoreo/lecturas', { method: 'POST', headers: { 'x-device-key': cam[label].api_key }, body: reading });
	r.status = await req(base, '/api/dispositivos/proyectos/7/estado', { headers: REG });
	r.ota = await req(base, '/api/firmware/latest', { headers: dev(label) });
	r.otaDownload = await req(base, '/api/firmware/download', { headers: dev(label) });
	r.led = await req(base, '/api/dispositivos/proyectos/7/configuracion', { method: 'POST', headers: REG, body: { configuracion_led: 'suave', color_led: 'verde', brillo_led: 64, tipo_tierra: 'compost' } });
	r.unlinkCam = await req(base, '/api/dispositivos/proyectos/7?tipo_dispositivo=camara', { method: 'DELETE', headers: REG });
	r.unlink = await req(base, '/api/dispositivos/proyectos/7', { method: 'DELETE', headers: REG });
	results[label] = r;
}
const o = results.orig; const n = results.new;
compare('Firmware', 'POST /vincular sensor (X-Registration-Key)', o.link, n.link, { ignore: ['dispositivo_id'] });
compare('Firmware', 'POST /vincular cámara', o.linkCam, n.linkCam, { ignore: ['dispositivo_id'] });
compare('Firmware', 'GET /configuracion (vinculado)', o.config, n.config, { ignore: ['dispositivo_id', 'codigo_interno'] });
compare('Firmware', 'POST /lecturas', o.reading, n.reading);
compare('Firmware', 'POST /lecturas temperatura inválida', o.readingBad, n.readingBad);
compare('Firmware', 'POST /fotografias con clave de sensor', o.sensorPhoto, n.sensorPhoto);
compare('Firmware', 'POST /fotografias ESP32-CAMERA (JPEG crudo)', { ...o.camPhoto, json: shape(o.camPhoto.json) }, { ...n.camPhoto, json: shape(n.camPhoto.json) });
compare('Firmware', 'POST /lecturas con clave de cámara', o.camReading, n.camReading);
compare('Firmware', 'GET /proyectos/:id/estado', { ...o.status, json: shape(o.status.json) }, { ...n.status, json: shape(n.status.json) });
compare('Firmware', 'GET /firmware/latest (OTA)', o.ota, n.ota);
compare('Firmware', 'GET /firmware/download (OTA)', o.otaDownload, n.otaDownload);
compare('Firmware', 'POST /proyectos/:id/configuracion (LED)', o.led, n.led);
compare('Firmware', 'DELETE vincular cámara', o.unlinkCam, n.unlinkCam, { ignore: ['dispositivo_desvinculado'] });
compare('Firmware', 'DELETE vincular sensor', o.unlink, n.unlink);
compare('Firmware', 'GET /firmware/download-inicial', ...(await both('/api/firmware/download-inicial')));
compare('Firmware', 'GET /firmware/first-install/manifest', ...(await both('/api/firmware/first-install/manifest')));
compare('Firmware', 'GET /first-install/files/bootloader.bin', ...(await both('/api/firmware/first-install/files/bootloader.bin')));
compare('Firmware', 'GET /first-install/files/no-existe.bin', ...(await both('/api/firmware/first-install/files/no-existe.bin')));
compare('Firmware', 'GET /firmware/status (X-Registration-Key)', ...(await both('/api/firmware/status', { headers: REG })));
compare('Firmware', 'GET /firmware/latest sin clave', ...(await both('/api/firmware/latest')));

// ---------- Web: autenticación y catálogos ----------
const loginBody = { identifier: 'dpaniagua', password: 'Rural40-local' };
const [loginO, loginN] = await both('/api/auth/login', { method: 'POST', body: loginBody });
compare('Web', 'POST /auth/login', loginO, loginN);
record('Web', 'cookie de sesión compatible (mismo nombre y atributos)', loginO.cookie?.split(';').slice(1).join(';') === loginN.cookie?.split(';').slice(1).join(';') ? 'IGUAL' : 'DIFERENTE', loginN.cookie?.split(';').slice(1).join(';'));
compare('Web', 'POST /auth/login contraseña errada', ...(await both('/api/auth/login', { method: 'POST', body: { ...loginBody, password: 'x' } })));
compare('Web', 'POST /auth/logout', ...(await both('/api/auth/logout', { method: 'POST' })));
compare('Web', 'GET /auth/instituciones', ...(await both('/api/auth/instituciones')));
compare('Web', 'GET /auth/tipos-documento', ...(await both('/api/auth/tipos-documento')));
compare('Web', 'POST /auth/forgot-password (sin SMTP local)', ...(await both('/api/auth/forgot-password', { method: 'POST', body: { identifier: 'noexiste@x.co' } })));
compare('Web', 'POST /auth/register/verify código inválido', ...(await both('/api/auth/register/verify', { method: 'POST', body: { correo: 'a@b.co', code: 'ABCDEFGH' } })));
compare('Web', 'GET /proyectos/plantas', ...(await both('/api/proyectos/plantas')));
compare('Web', 'GET /health', ...(await both('/api/health')));
compare('Web', 'GET /health/db', ...(await both('/api/health/db')));

// ---------- Web: datos del estudiante (original por usuario_id, nueva por sesión) ----------
const cookieO = { cookie: loginO.cookie.split(';')[0] };
const cookieN = { cookie: loginN.cookie.split(';')[0] };
const pair = async (origPath, newPath, init = {}) => [await req(ORIG, origPath, { ...init, headers: { ...cookieO, ...(init.headers || {}) } }), await req(NEW, newPath, { ...init, headers: { ...cookieN, ...(init.headers || {}) } })];
compare('Estudiante', 'GET /proyectos', ...(await pair('/api/proyectos?usuario_id=1', '/api/proyectos')));
compare('Estudiante', 'GET /proyectos/docentes', ...(await pair('/api/proyectos/docentes', '/api/proyectos/docentes')));
compare('Estudiante', 'GET /proyectos/resumen/2', ...(await pair('/api/proyectos/resumen/2', '/api/proyectos/resumen/2')), { ignore: ['ultima_lectura.temperatura_c', 'ultima_lectura.humedad_ambiente_pct', 'ultima_lectura.humedad_suelo_pct', 'ultima_lectura.intensidad_luz_lux'] });
const [histO, histN] = await pair('/api/proyectos/resumen/2/lecturas?usuario_id=1', '/api/proyectos/resumen/2/lecturas');
record('Estudiante', 'GET /resumen/2/lecturas (cantidad y orden)', histO.status === histN.status && histO.json.length === histN.json.length && histO.json.every((r, i) => r.fecha_lectura === histN.json[i].fecha_lectura) ? 'IGUAL' : 'DIFERENTE', `${histO.json.length} vs ${histN.json.length} lecturas`);
compare('Estudiante', 'GET /monitoreo/bitacoras', ...(await pair('/api/monitoreo/bitacoras?id_proyecto=2&id_usuario=1', '/api/monitoreo/bitacoras?id_proyecto=2')));
compare('Estudiante', 'GET /monitoreo/fotografias', ...(await pair('/api/monitoreo/fotografias?id_proyecto=2&id_usuario=1', '/api/monitoreo/fotografias?id_proyecto=2')));
const logBody = { id_proyecto: 7, fecha_bitacora: '2026-09-01', observacion: 'Regresión', retos_completados: ['color'], humedad_suelo_pct: 60 };
compare('Estudiante', 'POST /monitoreo/bitacoras', ...(await pair('/api/monitoreo/bitacoras', '/api/monitoreo/bitacoras', { method: 'POST', body: { ...logBody, id_usuario: 1 } })));
const logs = (await req(NEW, '/api/monitoreo/bitacoras?id_proyecto=7', { headers: cookieN })).json;
const logId = logs.find((log) => String(log.fecha_bitacora).startsWith('2026-09-0'))?.id;
compare('Estudiante', 'PUT /monitoreo/bitacoras/:id', ...(await pair(`/api/monitoreo/bitacoras/${logId}`, `/api/monitoreo/bitacoras/${logId}`, { method: 'PUT', body: { ...logBody, id_usuario: 1, observacion: 'Editada' } })));
compare('Estudiante', 'PUT /proyectos/:id', ...(await pair('/api/proyectos/7', '/api/proyectos/7', { method: 'PUT', body: { id_usuario: 1, id_docente: 2, id_planta: 6, nombre: 'Huerta Escolar 2', descripcion: 'Prueba 2' } })));
compare('Estudiante', 'DELETE /monitoreo/bitacoras/:id', ...(await pair(`/api/monitoreo/bitacoras/${logId}?id_proyecto=7&id_usuario=1`, `/api/monitoreo/bitacoras/${logId}`, { method: 'DELETE' })));

// ---------- Páginas ----------
for (const page of ['/', '/index.html', '/registro.html', '/recuperar.html', '/restablecer.html', '/css/styles.css', '/js/login.js', '/js/registro.js', '/favicon.svg', '/cualquier-ruta']) {
	compare('Páginas', `GET ${page}`, ...(await both(page)), { expect: 'status' });
}
const [studentO, studentN] = [await req(ORIG, '/estudiante.html', { headers: cookieO }), await req(NEW, '/estudiante.html', { headers: cookieN })];
record('Páginas', 'GET /estudiante.html con sesión', studentO.status === studentN.status ? 'IGUAL' : 'DIFERENTE', `HTTP ${studentO.status} → ${studentN.status}`);
compare('Páginas', 'GET /estudiante.html sin sesión (redirige)', ...(await both('/estudiante.html')));
compare('Páginas', 'GET /docente.html sin sesión (redirige)', ...(await both('/docente.html')));

// ---------- Cambios intencionales de seguridad ----------
compare('Seguridad', 'GET /api/config', ...(await both('/api/config')));
compare('Seguridad', 'GET /proyectos?usuario_id=1 SIN sesión', ...(await both('/api/proyectos?usuario_id=1')), { expect: 'status' });
compare('Seguridad', 'GET /resumen/2 SIN sesión', ...(await both('/api/proyectos/resumen/2')), { expect: 'status' });
compare('Seguridad', 'DELETE /dispositivos/proyectos/2 SIN nada', await req(ORIG, '/api/dispositivos/proyectos/999', { method: 'DELETE' }), await req(NEW, '/api/dispositivos/proyectos/999', { method: 'DELETE' }), { expect: 'status' });
compare('Seguridad', 'GET /api/no-existe', ...(await both('/api/no-existe')), { expect: 'status' });

const counts = rows.reduce((total, row) => ({ ...total, [row.verdict]: (total[row.verdict] || 0) + 1 }), {});
console.log(rows.map((row) => `${row.verdict.padEnd(22)} ${row.area.padEnd(11)} ${row.name}${row.detail ? `  →  ${row.detail}` : ''}`).join('\n'));
console.log('\nRESUMEN', JSON.stringify(counts));
