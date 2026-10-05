const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const repo = require('../repositories/admin.repo');
const dispositivosService = require('./dispositivos.service');
const correo = require('./correo.service');
const { firmwareStatus } = require('./firmware.service');
const { audit } = require('./auditoria.service');
const { ROLES } = require('../config/catalogos');
const { ValidationError, NotFoundError, ConflictError, HttpError } = require('../lib/errors');
const { positiveInteger, text } = require('../lib/http');

// Reglas del módulo de administración:
// - El administrador crea cuentas de DOCENTE y ADMINISTRADOR; los estudiantes se registran solos.
// - Las cuentas nuevas reciben una invitación por correo para crear su propia contraseña:
//   el administrador nunca conoce ni envía contraseñas.
// - Nadie puede desactivarse a sí mismo ni cambiarse el rol, y siempre queda al menos un
//   administrador activo, para no perder el acceso al sistema.
// - No se cambia el rol de quien tiene proyectos activos en su rol actual (primero reasignar).

const INVITATION_HOURS = 72;
const RESET_HOURS = 24;
const ROLE_LABELS = { ESTUDIANTE: 'estudiante', DOCENTE: 'docente', ADMINISTRADOR: 'administrador' };
const STAFF_ROLES = [ROLES.DOCENTE, ROLES.ADMINISTRADOR];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function flag(value) {
	return Boolean(Number(value));
}

function numberOrZero(value) {
	return Number(value) || 0;
}

async function loadUser(userIdValue) {
	const userId = positiveInteger(userIdValue);
	const user = userId ? await repo.findUser(userId) : null;
	if (!user) throw new NotFoundError('Usuario no encontrado.');
	return user;
}

function formatUser(user) {
	return {
		...user,
		activo: flag(user.estado),
		proyectos_como_estudiante: numberOrZero(user.proyectos_como_estudiante),
		proyectos_como_docente: numberOrZero(user.proyectos_como_docente),
		invitacion_pendiente: !user.ultimo_acceso,
	};
}

// --- Resumen ---

async function overview() {
	const [counts, quizzes] = await Promise.all([repo.overview(), repo.quizOverview()]);
	const numbers = Object.fromEntries(Object.entries({ ...counts, ...quizzes }).map(([key, value]) => [key, numberOrZero(value)]));
	return { ...numbers, firmware: firmwareStatus('sensor'), firmware_camara: firmwareStatus('camara') };
}

// --- Usuarios ---

function readUserFields(body = {}) {
	const fields = {
		idTipoDocumento: positiveInteger(body.id_tipo_documento),
		numeroDocumento: text(body.numero_documento).slice(0, 30),
		nombres: text(body.nombres).slice(0, 100),
		apellidos: text(body.apellidos).slice(0, 100),
		correo: text(body.correo).toLowerCase().slice(0, 150),
		telefono: text(body.telefono).slice(0, 30) || null,
		idInstitucion: positiveInteger(body.id_institucion),
		usuario: text(body.usuario).slice(0, 80),
	};
	if (!fields.idTipoDocumento || !fields.numeroDocumento || !fields.nombres || !fields.apellidos || !fields.correo || !fields.idInstitucion || !fields.usuario) {
		throw new ValidationError('Completa tipo y número de documento, nombres, apellidos, correo, institución y usuario.');
	}
	if (!EMAIL_PATTERN.test(fields.correo)) throw new ValidationError('El correo no es válido.');
	if (!/^[A-Za-z0-9._-]{3,80}$/.test(fields.usuario)) throw new ValidationError('El usuario solo puede tener letras, números, punto, guion y guion bajo (mínimo 3).');
	return fields;
}

async function assertUnique(fields, excludeId = 0) {
	const conflict = await repo.findConflict(fields, excludeId);
	if (!conflict) return;
	if (conflict.usuario === fields.usuario) throw new ConflictError('Ese nombre de usuario ya está en uso.');
	if (conflict.correo === fields.correo) throw new ConflictError('Ese correo ya está registrado.');
	throw new ConflictError('Ya existe un usuario con ese documento.');
}

async function listUsers(query = {}) {
	const rol = text(query.rol).toUpperCase() || null;
	const estado = query.estado === 'activos' ? 1 : query.estado === 'inactivos' ? 0 : null;
	const users = await repo.listUsers({ rol, institucion: positiveInteger(query.institucion), estado, q: text(query.q).slice(0, 80) || null });
	return users.map(formatUser);
}

// Envía la invitación o el enlace para restablecer. Si el correo falla, en una invitación
// (cuenta que nunca ha entrado) se devuelve el enlace para compartirlo por otro medio.
async function sendAccess(user, { invitation }) {
	const hours = invitation ? INVITATION_HOURS : RESET_HOURS;
	const { rawToken, tokenHash } = correo.createAccessToken();
	await repo.replaceAccessToken(user.id, tokenHash, hours);
	try {
		if (invitation) await correo.sendInvitationEmail(user, rawToken, { roleLabel: ROLE_LABELS[user.rol] || 'usuario', hours });
		else await correo.sendRecoveryEmail(user, rawToken);
		return { enviada: true, horas: hours };
	} catch (error) {
		console.error('Access email failed:', error.message);
		if (invitation) return { enviada: false, horas: hours, enlace: correo.resetUrl(rawToken, { invitation: true }) };
		throw new HttpError(503, 'No fue posible enviar el correo. Revisa la configuración SMTP e inténtalo de nuevo.');
	}
}

async function createUser(actor, body = {}) {
	const rol = text(body.rol).toUpperCase();
	if (!STAFF_ROLES.includes(rol)) throw new ValidationError('Desde aquí se crean docentes y administradores. Los estudiantes se registran solos.');
	const fields = readUserFields(body);
	if (!await repo.institutionExists(fields.idInstitucion)) throw new ValidationError('La institución seleccionada no existe o está inactiva.');
	await assertUnique(fields);
	const role = await repo.findRole(rol);
	if (!role) throw new ValidationError('El rol seleccionado no existe.');
	// Contraseña aleatoria que nadie conoce: la cuenta solo se usa tras aceptar la invitación.
	const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
	let userId;
	try {
		userId = await repo.insertUser({ ...fields, idRol: role.id, passwordHash });
	} catch (error) {
		if (error.code === 'ER_DUP_ENTRY') throw new ConflictError('El usuario, correo o documento ya está registrado.');
		throw error;
	}
	await audit(actor, 'usuario.crear', 'usuario', userId, { rol, usuario: fields.usuario });
	const invitation = await sendAccess({ id: userId, nombres: fields.nombres, correo: fields.correo, usuario: fields.usuario, rol }, { invitation: true });
	return { id: userId, invitacion: invitation };
}

async function updateUser(actor, userId, body) {
	const user = await loadUser(userId);
	const fields = readUserFields(body);
	if (Number(fields.idInstitucion) !== Number(user.id_institucion) && !await repo.institutionExists(fields.idInstitucion)) {
		throw new ValidationError('La institución seleccionada no existe o está inactiva.');
	}
	await assertUnique(fields, user.id);
	await repo.updateUser(user.id, fields);
	await audit(actor, 'usuario.editar', 'usuario', user.id, { usuario: fields.usuario, correo: fields.correo });
	return formatUser(await repo.findUser(user.id));
}

async function changeRole(actor, userId, roleValue) {
	const user = await loadUser(userId);
	const rol = text(roleValue).toUpperCase();
	if (!Object.values(ROLES).includes(rol)) throw new ValidationError('Rol inválido.');
	if (Number(user.id) === Number(actor.id)) throw new ConflictError('No puedes cambiar tu propio rol.');
	if (rol === user.rol) return formatUser(user);
	if (user.rol === ROLES.DOCENTE && numberOrZero(user.proyectos_como_docente)) {
		throw new ConflictError(`Este docente acompaña ${user.proyectos_como_docente} proyecto(s) activo(s). Reasígnalos a otro docente antes de cambiar su rol.`);
	}
	if (user.rol === ROLES.ESTUDIANTE && numberOrZero(user.proyectos_como_estudiante)) {
		throw new ConflictError(`Este estudiante tiene ${user.proyectos_como_estudiante} proyecto(s) activo(s). No se puede cambiar su rol mientras los tenga.`);
	}
	if (user.rol === ROLES.ADMINISTRADOR && flag(user.estado) && await repo.countActiveAdmins() <= 1) {
		throw new ConflictError('Debe quedar al menos un administrador activo.');
	}
	const role = await repo.findRole(rol);
	await repo.setUserRole(user.id, role.id);
	await audit(actor, 'usuario.cambiar_rol', 'usuario', user.id, { de: user.rol, a: rol });
	return formatUser(await repo.findUser(user.id));
}

async function setUserActive(actor, userId, active) {
	const user = await loadUser(userId);
	if (!active && Number(user.id) === Number(actor.id)) throw new ConflictError('No puedes desactivar tu propia cuenta.');
	if (!active && user.rol === ROLES.ADMINISTRADOR && flag(user.estado) && await repo.countActiveAdmins() <= 1) {
		throw new ConflictError('Debe quedar al menos un administrador activo.');
	}
	await repo.setUserActive(user.id, active);
	await audit(actor, active ? 'usuario.activar' : 'usuario.desactivar', 'usuario', user.id, { usuario: user.usuario });
	const warning = !active && user.rol === ROLES.DOCENTE && numberOrZero(user.proyectos_como_docente)
		? `Sus ${user.proyectos_como_docente} proyecto(s) quedaron sin docente activo: reasígnalos desde el panel docente.`
		: null;
	return { ...formatUser(await repo.findUser(user.id)), aviso: warning };
}

async function resendAccess(actor, userId) {
	const user = await loadUser(userId);
	if (!flag(user.estado)) throw new ConflictError('Activa la cuenta antes de enviarle un enlace de acceso.');
	if (!user.correo) throw new ConflictError('El usuario no tiene correo registrado.');
	const invitation = !user.ultimo_acceso;
	const result = await sendAccess(user, { invitation });
	await audit(actor, invitation ? 'usuario.reenviar_invitacion' : 'usuario.enviar_restablecimiento', 'usuario', user.id);
	return { ...result, tipo: invitation ? 'invitacion' : 'restablecimiento' };
}

async function catalogsForUsers() {
	const [roles, tiposDocumento, instituciones] = await Promise.all([repo.listRoles(), repo.listDocumentTypes(), repo.listInstitutions()]);
	return { roles, tipos_documento: tiposDocumento, instituciones: instituciones.filter((institution) => flag(institution.estado)) };
}

// --- Instituciones ---

async function listInstitutions() {
	return (await repo.listInstitutions()).map((institution) => ({ ...institution, activo: flag(institution.estado), usuarios: numberOrZero(institution.usuarios) }));
}

async function saveInstitution(actor, institutionIdValue, body = {}) {
	const institutionId = institutionIdValue ? positiveInteger(institutionIdValue) : null;
	if (institutionIdValue && !institutionId) throw new ValidationError('Institución inválida.');
	const fields = {
		nombre: text(body.nombre).slice(0, 150),
		codigoDane: text(body.codigo_dane).slice(0, 20) || null,
		direccion: text(body.direccion).slice(0, 255) || null,
		municipio: text(body.municipio).slice(0, 100) || null,
		departamento: text(body.departamento).slice(0, 100) || null,
		correo: text(body.correo).toLowerCase().slice(0, 150) || null,
		telefono: text(body.telefono).slice(0, 30) || null,
	};
	if (!fields.nombre) throw new ValidationError('El nombre de la institución es obligatorio.');
	if (fields.correo && !EMAIL_PATTERN.test(fields.correo)) throw new ValidationError('El correo de la institución no es válido.');
	try {
		const id = await repo.saveInstitution(institutionId, fields);
		await audit(actor, institutionId ? 'institucion.editar' : 'institucion.crear', 'institucion', id, { nombre: fields.nombre });
		return { id };
	} catch (error) {
		if (error.code === 'ER_DUP_ENTRY') throw new ConflictError('Ya existe una institución con ese código DANE.');
		throw error;
	}
}

async function setInstitutionActive(actor, institutionIdValue, active) {
	const institutionId = positiveInteger(institutionIdValue);
	if (!institutionId || !await repo.setInstitutionActive(institutionId, active)) throw new NotFoundError('Institución no encontrada.');
	await audit(actor, active ? 'institucion.activar' : 'institucion.desactivar', 'institucion', institutionId);
	return { id: institutionId, activo: active };
}

// --- Plantas ---

async function listPlants() {
	return (await repo.listPlants()).map((plant) => ({ ...plant, activo: flag(plant.estado), proyectos: numberOrZero(plant.proyectos) }));
}

async function savePlant(actor, plantIdValue, body = {}) {
	const plantId = plantIdValue ? positiveInteger(plantIdValue) : null;
	if (plantIdValue && !plantId) throw new ValidationError('Planta inválida.');
	const fields = {
		nombreComun: text(body.nombre_comun).slice(0, 100),
		nombreCientifico: text(body.nombre_cientifico).slice(0, 150) || null,
		tipoCultivo: text(body.tipo_cultivo).slice(0, 100) || null,
		descripcion: text(body.descripcion).slice(0, 2000) || null,
	};
	if (!fields.nombreComun) throw new ValidationError('El nombre común de la planta es obligatorio.');
	const id = await repo.savePlant(plantId, fields);
	await audit(actor, plantId ? 'planta.editar' : 'planta.crear', 'planta', id, { nombre: fields.nombreComun });
	return { id };
}

async function setPlantActive(actor, plantIdValue, active) {
	const plantId = positiveInteger(plantIdValue);
	if (!plantId || !await repo.setPlantActive(plantId, active)) throw new NotFoundError('Planta no encontrada.');
	await audit(actor, active ? 'planta.activar' : 'planta.desactivar', 'planta', plantId);
	return { id: plantId, activo: active };
}

// --- Dispositivos ---

async function listDevices() {
	const devices = await repo.listDevices();
	return devices.map((device) => ({
		...device,
		activo: flag(device.estado),
		pendiente_vinculacion: flag(device.pendiente_vinculacion),
		lecturas_24h: numberOrZero(device.lecturas_24h),
		fotos_24h: numberOrZero(device.fotos_24h),
		tipo: String(device.modelo || '').toUpperCase() === 'ESP32-CAMERA' ? 'camara' : 'sensor',
		en_linea: device.minutos_sin_contacto !== null && Number(device.minutos_sin_contacto) <= 30,
		estudiante: device.estudiante_nombres ? `${device.estudiante_nombres} ${device.estudiante_apellidos}`.trim() : null,
	}));
}

async function loadDevice(deviceIdValue) {
	const deviceId = positiveInteger(deviceIdValue);
	const device = deviceId ? await repo.findDevice(deviceId) : null;
	if (!device) throw new NotFoundError('Dispositivo no encontrado.');
	return device;
}

// Libera un dispositivo de su proyecto (por ejemplo, un proyecto abandonado).
async function releaseDevice(actor, deviceId) {
	const device = await loadDevice(deviceId);
	if (!device.id_proyecto) throw new ConflictError('El dispositivo no está vinculado a ningún proyecto.');
	return dispositivosService.unlink(actor, device.id_proyecto, device.slot);
}

async function setDeviceActive(actor, deviceId, active) {
	const device = await loadDevice(deviceId);
	if (!active && device.id_proyecto) throw new ConflictError('Desvincula el dispositivo de su proyecto antes de desactivarlo.');
	await repo.setDeviceActive(device.id, active);
	await audit(actor, active ? 'dispositivo.activar' : 'dispositivo.desactivar', 'dispositivo', device.id, { codigo: device.codigo_interno });
	return { id: device.id, activo: active };
}

// --- Auditoría ---

function parseDetail(value) {
	if (!value) return null;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

async function listAudit(query = {}) {
	const limit = Math.min(positiveInteger(query.limite) || 50, 200);
	const offset = Math.max(Number(query.desplazamiento) || 0, 0);
	const date = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : null);
	try {
		const [rows, actions] = await Promise.all([
			repo.listAudit({ accion: text(query.accion) || null, idUsuario: positiveInteger(query.usuario), desde: date(query.desde), hasta: date(query.hasta), limit, offset }),
			repo.listAuditActions(),
		]);
		return {
			disponible: true,
			acciones: actions,
			registros: rows.slice(0, limit).map((row) => ({ ...row, detalle: parseDetail(row.detalle) })),
			hay_mas: rows.length > limit,
			desplazamiento: offset,
		};
	} catch (error) {
		if (error.code === 'ER_NO_SUCH_TABLE') return { disponible: false, acciones: [], registros: [], hay_mas: false, desplazamiento: 0 };
		throw error;
	}
}

module.exports = {
	INVITATION_HOURS,
	overview,
	listUsers,
	catalogsForUsers,
	createUser,
	updateUser,
	changeRole,
	setUserActive,
	resendAccess,
	listInstitutions,
	saveInstitution,
	setInstitutionActive,
	listPlants,
	savePlant,
	setPlantActive,
	listDevices,
	releaseDevice,
	setDeviceActive,
	listAudit,
};
