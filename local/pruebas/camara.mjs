// Cámara: provisión como ESP32-CAMERA, OTA separado, vinculación, fotos JPEG, timelapse, álbum y reto.
// Usa el proyecto 3 (juan.tamayo) para no tocar la cámara real vinculada en otros proyectos.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReport, login, call, uniqueMac, PROVISIONING_KEY, todayLocal } from './_lib.mjs';

const PROJECT = 3;
const photosDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'backend', 'uploads', 'photos');

function samplePhotos() {
	const files = [];
	const walk = (directory) => fs.existsSync(directory) && fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
		const full = path.join(directory, entry.name);
		if (entry.isDirectory()) walk(full);
		else if (/\.jpe?g$/i.test(entry.name) && fs.statSync(full).size > 1000) files.push(full);
	});
	walk(photosDirectory);
	return files.slice(0, 2).map((file) => fs.readFileSync(file));
}

export default async function run() {
	const report = createReport('Cámara y timelapse');
	const { check } = report;
	const owner = (await login('juan.tamayo')).cookie;
	const teacher = (await login('marruiz')).cookie;
	const outsider = (await login('dpaniagua')).cookie;
	const images = samplePhotos();
	check('fotos de muestra disponibles', images.length > 0);
	await call(owner, `/api/dispositivos/proyectos/${PROJECT}?tipo_dispositivo=camara`, { method: 'DELETE' });

	const mac = uniqueMac(2);
	const code = `CAM-${mac.replaceAll(':', '').slice(-8)}`;
	const provision = await call(null, '/api/dispositivos/provisionar', { method: 'POST', headers: { 'x-provisioning-key': PROVISIONING_KEY }, body: { codigo_interno: code, mac_address: mac, modelo: 'ESP32-CAMERA', version_firmware: '1.0.3' } });
	check('provisión como ESP32-CAMERA', provision.status === 201, code);
	const key = { 'x-device-key': provision.body.api_key };
	check('sin vincular: proyecto_id null', (await call(null, '/api/dispositivos/configuracion', { headers: key })).body?.proyecto_id === null);
	check('sin vincular: foto rechazada (401)', (await call(null, '/api/monitoreo/fotografias', { method: 'POST', headers: key, raw: images[0] })).status === 401);
	check('OTA de la cámara nunca entrega el firmware del sensor (204)', (await call(null, '/api/firmware/latest', { headers: key })).status === 204);
	check('imagen de primera instalación de la cámara publicada', (await call(null, '/api/firmware/first-install/manifest?tipo=camara')).status === 200);

	const pending = (await call(owner, '/api/dispositivos/pendientes')).body;
	check('aparece en pendientes', pending.some((device) => device.codigo_interno === code));
	const asSensor = await call(owner, `/api/dispositivos/proyectos/${PROJECT}/vincular`, { method: 'POST', body: { codigo_interno: code, codigo_vinculacion: provision.body.codigo_vinculacion, tipo_dispositivo: 'sensor', configuracion_led: 'media', color_led: 'rojo', brillo_led: 128, tipo_tierra: 'franca' } });
	check('no se vincula una cámara como sensor (409)', asSensor.status === 409, asSensor.body?.error);
	const link = await call(owner, `/api/dispositivos/proyectos/${PROJECT}/vincular`, { method: 'POST', body: { codigo_interno: code, codigo_vinculacion: provision.body.codigo_vinculacion, tipo_dispositivo: 'camara' } });
	check('vincular como cámara', link.status === 200, JSON.stringify(link.body));
	check('vinculada: tipo cámara', (await call(null, '/api/dispositivos/configuracion', { headers: key })).body?.tipo_dispositivo === 'camara');

	await call(owner, '/api/monitoreo/bitacoras', { method: 'POST', body: { id_proyecto: PROJECT, fecha_bitacora: todayLocal(), observacion: 'Prueba cámara', retos_completados: ['color'] } });
	const before = (await call(owner, `/api/monitoreo/timelapse?id_proyecto=${PROJECT}&rango=24h`)).body.total;
	let sent = 0;
	for (let index = 0; index < 12; index++) {
		if ((await call(null, '/api/monitoreo/fotografias', { method: 'POST', headers: key, raw: images[index % images.length] })).status === 201) sent++;
	}
	check('12 fotos JPEG crudas (201)', sent === 12, `${sent}/12`);
	const lapse = (await call(owner, `/api/monitoreo/timelapse?id_proyecto=${PROJECT}&rango=24h`)).body;
	check('timelapse suma las 12 fotos', lapse.total - before === 12, `${before} → ${lapse.total}`);
	const sampled = (await call(owner, `/api/monitoreo/timelapse?id_proyecto=${PROJECT}&rango=24h&max=10`)).body;
	check('timelapse muestreado conserva primera y última', sampled.cuadros.length === Math.min(10, sampled.total) && sampled.cuadros.at(-1).id === lapse.cuadros.at(-1).id);
	check('las fotos del timelapse se sirven (200)', (await call(null, lapse.cuadros.at(-1).url)).status === 200);
	check('foto inexistente en /uploads → 404', (await call(null, '/uploads/photos/no-existe.jpg')).status === 404);
	check('álbum "Mis fotos" excluye las de la cámara', (await call(owner, `/api/monitoreo/fotografias?id_proyecto=${PROJECT}&origen=estudiante`)).body.every((photo) => photo.id_dispositivo === null));
	const today = (await call(owner, `/api/monitoreo/bitacoras?id_proyecto=${PROJECT}`)).body.find((log) => String(log.fecha_bitacora).slice(0, 10) === todayLocal());
	check('la foto automática no completa el reto "foto"', !String(today?.retos_completados || '').includes('foto'));
	check('otro estudiante no ve el timelapse (404)', (await call(outsider, `/api/monitoreo/timelapse?id_proyecto=${PROJECT}`)).status === 404);
	check('el docente ve el timelapse', (await call(teacher, `/api/monitoreo/timelapse?id_proyecto=${PROJECT}&rango=24h`)).body?.total === lapse.total);
	const frame = lapse.cuadros.at(-1);
	check('el docente oculta un cuadro', (await call(teacher, `/api/docente/fotografias/${frame.id}`, { method: 'PATCH', body: { oculta: true } })).status === 200);
	check('el cuadro oculto sale del timelapse', !(await call(owner, `/api/monitoreo/timelapse?id_proyecto=${PROJECT}&rango=24h`)).body.cuadros.some((item) => item.id === frame.id));

	const admin = (await login('admin.local')).cookie;
	const device = (await call(admin, '/api/admin/dispositivos')).body.find((item) => item.codigo_interno === code);
	check('admin ve fotos 24 h y cámara en línea', device?.fotos_24h === 12 && device?.en_linea);
	check('desvincular la cámara de prueba', (await call(owner, `/api/dispositivos/proyectos/${PROJECT}?tipo_dispositivo=camara`, { method: 'DELETE' })).status === 200);
	check('el admin la desactiva', (await call(admin, `/api/admin/dispositivos/${device.id}/estado`, { method: 'PATCH', body: { activo: false } })).status === 200);
	check('desactivada: no se reactiva al reprovisionarse (403)', (await call(null, '/api/dispositivos/provisionar', { method: 'POST', headers: { 'x-provisioning-key': PROVISIONING_KEY }, body: { codigo_interno: code, mac_address: mac, modelo: 'ESP32-CAMERA' } })).status === 403);
	return report.print();
}

if (import.meta.url === `file:///${process.argv[1].replaceAll('\\', '/')}`) run().then((failed) => process.exit(failed ? 1 : 0));
