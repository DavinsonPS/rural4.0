// Administración: acceso, invitación completa, reglas de roles, catálogos, dispositivos, auditoría.
import { createReport, login, call, BASE, RUN } from './_lib.mjs';

export default async function run() {
	const report = createReport('Administración');
	const { check } = report;
	const adminLogin = await login('admin.local');
	check('login admin → admin.html', adminLogin.body.redirect === '/admin.html');
	const admin = adminLogin.cookie;
	const teacher = (await login('marruiz')).cookie;
	const student = (await login('dpaniagua')).cookie;
	check('admin.html con sesión de admin (200)', (await call(admin, '/admin.html')).status === 200);
	check('admin.html con sesión de docente redirige (302)', (await call(teacher, '/admin.html')).status === 302);
	check('docente.html abierto para el admin', (await call(admin, '/docente.html')).status === 200);
	check('API admin rechaza al docente (403)', (await call(teacher, '/api/admin/resumen')).status === 403);
	check('API admin sin sesión (401)', (await call(null, '/api/admin/resumen')).status === 401);

	const overview = await call(admin, '/api/admin/resumen');
	check('resumen', overview.status === 200 && overview.body.firmware && overview.body.firmware_camara, `sensor ${overview.body?.firmware?.version} · cámara ${overview.body?.firmware_camara?.version || '—'}`);

	const doc = String(Date.now()).slice(-9);
	const created = await call(admin, '/api/admin/usuarios', { method: 'POST', body: { rol: 'DOCENTE', id_tipo_documento: 1, numero_documento: doc, nombres: 'Docente', apellidos: `Prueba ${RUN}`, correo: `docente.${RUN}@prueba.co`, id_institucion: 1, usuario: `doc.${RUN}` } });
	check('crear docente (sin SMTP → enlace de invitación)', created.status === 201 && created.body.invitacion.enviada === false && /invitacion=1/.test(created.body.invitacion.enlace));
	check('usuario duplicado (409)', (await call(admin, '/api/admin/usuarios', { method: 'POST', body: { rol: 'DOCENTE', id_tipo_documento: 1, numero_documento: `${doc}9`, nombres: 'X', apellidos: 'Y', correo: `otro.${RUN}@prueba.co`, id_institucion: 1, usuario: `doc.${RUN}` } })).status === 409);
	check('no crea estudiantes (400)', (await call(admin, '/api/admin/usuarios', { method: 'POST', body: { rol: 'ESTUDIANTE', id_tipo_documento: 1, numero_documento: `${doc}8`, nombres: 'X', apellidos: 'Y', correo: `est.${RUN}@prueba.co`, id_institucion: 1, usuario: `est.${RUN}` } })).status === 400);
	const token = new URL(created.body.invitacion.enlace).searchParams.get('token');
	check('antes de aceptar la invitación no puede entrar', (await login(`doc.${RUN}`, 'Cualquiera123')).status === 401);
	const accept = await fetch(`${BASE}/api/auth/reset-password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password: 'ClaveNueva2026' }) });
	check('aceptar invitación (crear contraseña)', accept.status === 200);
	const newTeacher = await login(`doc.${RUN}`, 'ClaveNueva2026');
	check('el docente nuevo entra', newTeacher.status === 200 && newTeacher.body.redirect === '/docente.html');
	check('la invitación es de un solo uso', (await fetch(`${BASE}/api/auth/reset-password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password: 'OtraClave2026' }) })).status === 400);
	check('el estudiante ya lo ve como docente', (await call(student, '/api/proyectos/docentes')).body.some((item) => item.usuario === `doc.${RUN}`));

	const id = created.body.id;
	check('editar usuario', (await call(admin, `/api/admin/usuarios/${id}`, { method: 'PUT', body: { id_tipo_documento: 1, numero_documento: doc, nombres: 'Docente', apellidos: `Editado ${RUN}`, correo: `docente.${RUN}@prueba.co`, id_institucion: 1, usuario: `doc.${RUN}` } })).body?.apellidos === `Editado ${RUN}`);
	check('docente con proyectos no cambia de rol (409)', (await call(admin, '/api/admin/usuarios/2/rol', { method: 'PATCH', body: { rol: 'ESTUDIANTE' } })).status === 409);
	const me = (await call(admin, '/api/auth/me')).body;
	check('el admin no se desactiva a sí mismo (409)', (await call(admin, `/api/admin/usuarios/${me.id}/estado`, { method: 'PATCH', body: { activo: false } })).status === 409);
	check('desactivar docente', (await call(admin, `/api/admin/usuarios/${id}/estado`, { method: 'PATCH', body: { activo: false } })).body?.activo === false);
	check('su sesión deja de servir al instante (401)', (await call(newTeacher.cookie, '/api/auth/me')).status === 401);

	const institution = await call(admin, '/api/admin/instituciones', { method: 'POST', body: { nombre: `I.E. Prueba ${RUN}`, codigo_dane: `DANE${RUN}` } });
	check('crear institución', institution.status === 201);
	check('código DANE duplicado (409)', (await call(admin, '/api/admin/instituciones', { method: 'POST', body: { nombre: 'Otra', codigo_dane: `DANE${RUN}` } })).status === 409);
	check('aparece en el registro público', (await (await fetch(`${BASE}/api/auth/instituciones`)).json()).some((item) => item.nombre.includes(RUN)));
	await call(admin, `/api/admin/instituciones/${institution.body.id}/estado`, { method: 'PATCH', body: { activo: false } });
	check('desactivada desaparece del registro', !(await (await fetch(`${BASE}/api/auth/instituciones`)).json()).some((item) => item.nombre.includes(RUN)));
	const plant = await call(admin, '/api/admin/plantas', { method: 'POST', body: { nombre_comun: `Planta ${RUN}`, descripcion: 'Prueba 🌱' } });
	check('crear planta', plant.status === 201);
	await call(admin, `/api/admin/plantas/${plant.body.id}/estado`, { method: 'PATCH', body: { activo: false } });
	check('planta desactivada no se ofrece a estudiantes', !(await (await fetch(`${BASE}/api/proyectos/plantas`)).json()).some((item) => item.nombre_comun === `Planta ${RUN}`));

	const devices = (await call(admin, '/api/admin/dispositivos')).body;
	check('listar dispositivos', devices.length > 0);
	const linked = devices.find((device) => device.id_proyecto && device.activo);
	if (linked) check('no desactiva un dispositivo vinculado (409)', (await call(admin, `/api/admin/dispositivos/${linked.id}/estado`, { method: 'PATCH', body: { activo: false } })).status === 409);
	const audit = await call(admin, '/api/admin/auditoria?accion=usuario');
	check('auditoría registra acciones del admin', audit.body?.disponible && audit.body.registros.some((row) => row.accion === 'usuario.crear'));
	return report.print();
}

if (import.meta.url === `file:///${process.argv[1].replaceAll('\\', '/')}`) run().then((failed) => process.exit(failed ? 1 : 0));
