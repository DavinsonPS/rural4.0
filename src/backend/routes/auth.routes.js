const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const { pool } = require('../db');
const { setSessionCookie, clearSessionCookie } = require('../session');

const router = express.Router();

function createRecoveryToken() {
	const rawToken = crypto.randomBytes(32).toString('hex');
	const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
	return { rawToken, tokenHash };
}

function createVerificationCode() {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	return Array.from(crypto.randomBytes(8), (value) => alphabet[value % alphabet.length]).join('');
}

function createMailTransporter() {
	const mailUser = process.env.EMAIL_USER;
	const mailPassword = process.env.EMAIL_PASS;
	if (!mailUser || !mailPassword) throw new Error('El servicio de correo no está configurado.');
	return nodemailer.createTransport({
		host: process.env.EMAIL_HOST || 'mail.rural40.ml-ware.com',
		port: Number(process.env.EMAIL_PORT) || 465,
		secure: String(process.env.EMAIL_SECURE || 'true') === 'true',
		auth: { user: mailUser, pass: mailPassword },
		tls: { rejectUnauthorized: false },
	});
}

async function sendRecoveryEmail(user, rawToken) {
	const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/restablecer.html?token=${rawToken}`;
	const mailUser = process.env.EMAIL_USER;
	const transporter = createMailTransporter();

	await transporter.sendMail({
		from: process.env.MAIL_FROM || `"Rural 4.0" <${mailUser}>`,
		to: user.correo,
		subject: 'Recuperación de contraseña | Rural 4.0',
		html: `<p>Hola, ${user.nombres}.</p><p>Recibimos una solicitud para cambiar tu contraseña de Rural 4.0.</p><p><a href="${resetUrl}">Crear una nueva contraseña</a></p><p>Este enlace vence en 30 minutos y solo puede usarse una vez.</p><p>Si no solicitaste este cambio, puedes ignorar este correo.</p>`,
	});
}

async function sendVerificationEmail(user, code) {
	const transporter = createMailTransporter();
	await transporter.sendMail({
		from: process.env.MAIL_FROM || `"Rural 4.0" <${process.env.EMAIL_USER}>`,
		to: user.correo,
		subject: 'Código de verificación | Rural 4.0',
		html: `<p>Hola, ${user.nombres}.</p><p>Usa este código para confirmar tu correo y terminar tu registro en Rural 4.0:</p><p style="font-size:24px;font-weight:bold;letter-spacing:6px">${code}</p><p>El código vence en 15 minutos y solo puede usarse una vez.</p><p>Si no solicitaste este registro, puedes ignorar este correo.</p>`,
	});
}

router.post('/login', async (request, response) => {
	const identifier = String(request.body?.identifier || '').trim();
	const password = String(request.body?.password || '');

	if (!identifier || !password) {
		return response.status(400).json({ error: 'Ingresa tu usuario y contraseña.' });
	}

	try {
		const [rows] = await pool.query(
			`SELECT u.id, u.nombres, u.apellidos, u.usuario, u.correo, u.numero_documento,
				u.password_hash, r.nombre AS rol
			 FROM tblh_usuarios u
			 INNER JOIN tbld_roles r ON r.id = u.id_rol
			 WHERE u.estado = 1
				AND (u.usuario = ? OR u.correo = ? OR u.numero_documento = ?)
				AND r.estado = 1
			 LIMIT 1`,
			[identifier, identifier, identifier],
		);

		const user = rows[0];
		if (!user || !(await bcrypt.compare(password, user.password_hash))) {
			return response.status(401).json({ error: 'Las credenciales no son válidas.' });
		}

		await pool.query('UPDATE tblh_usuarios SET ultimo_acceso = NOW() WHERE id = ?', [user.id]);

		const role = String(user.rol).toUpperCase();
		const redirect = role === 'ESTUDIANTE' ? '/estudiante.html' : '/docente.html';
		setSessionCookie(response, request, { id: user.id, rol: role });
		return response.json({
			user: {
				id: user.id,
				nombres: user.nombres,
				apellidos: user.apellidos,
				usuario: user.usuario,
				correo: user.correo,
				rol: role,
			},
			redirect,
		});
	} catch (error) {
		console.error('Login failed:', error.message);
		return response.status(500).json({ error: 'No fue posible iniciar sesión. Inténtalo de nuevo.' });
	}
});

router.post('/logout', (request, response) => {
	clearSessionCookie(response);
	response.json({ message: 'Sesión cerrada.' });
});

router.get('/instituciones', async (request, response) => {
	try {
		const [rows] = await pool.query('SELECT id, nombre FROM tbld_instituciones WHERE estado = 1 ORDER BY nombre');
		return response.json(rows);
	} catch (error) {
		console.error('Institutions lookup failed:', error.message);
		return response.status(500).json({ error: 'No fue posible cargar las instituciones.' });
	}
});

router.get('/tipos-documento', async (request, response) => {
	try {
		const [rows] = await pool.query('SELECT id, codigo, nombre FROM tbld_tipos_documentos WHERE estado = 1 ORDER BY id');
		return response.json(rows);
	} catch (error) {
		console.error('Document types lookup failed:', error.message);
		return response.status(500).json({ error: 'No fue posible cargar los tipos de documento.' });
	}
});

router.post('/register/request', async (request, response) => {
	const data = {
		id_tipo_documento: Number(request.body?.id_tipo_documento),
		numero_documento: String(request.body?.numero_documento || '').trim(),
		nombres: String(request.body?.nombres || '').trim(),
		apellidos: String(request.body?.apellidos || '').trim(),
		correo: String(request.body?.correo || '').trim().toLowerCase(),
		telefono: String(request.body?.telefono || '').trim(),
		id_institucion: Number(request.body?.id_institucion),
		usuario: String(request.body?.usuario || '').trim(),
	};
	const password = String(request.body?.password || '');
	if (!data.id_tipo_documento || !data.numero_documento || !data.nombres || !data.apellidos || !data.correo || !data.id_institucion || !data.usuario || password.length < 8) {
		return response.status(400).json({ error: 'Completa todos los campos y usa una contraseña de al menos 8 caracteres.' });
	}

	try {
		const [duplicates] = await pool.query(
			`SELECT usuario, correo, numero_documento FROM tblh_usuarios
			 WHERE usuario = ? OR correo = ? OR (id_tipo_documento = ? AND numero_documento = ?) LIMIT 1`,
			[data.usuario, data.correo, data.id_tipo_documento, data.numero_documento],
		);
		if (duplicates.length) return response.status(409).json({ error: 'El usuario, correo o documento ya está registrado.' });

		const passwordHash = await bcrypt.hash(password, 12);
		const code = createVerificationCode();
		const codeHash = crypto.createHash('sha256').update(code).digest('hex');
		await pool.query('DELETE FROM tblh_registros_pendientes WHERE correo = ?', [data.correo]);
		await pool.query(
			`INSERT INTO tblh_registros_pendientes
			 (id_tipo_documento, numero_documento, nombres, apellidos, correo, telefono, id_institucion, usuario, password_hash, codigo_hash, fecha_expiracion)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
			[data.id_tipo_documento, data.numero_documento, data.nombres, data.apellidos, data.correo, data.telefono || null, data.id_institucion, data.usuario, passwordHash, codeHash],
		);
		await sendVerificationEmail(data, code);
		return response.json({ message: 'Te enviamos un código de verificación al correo indicado.' });
	} catch (error) {
		console.error('Registration request failed:', error.message);
		return response.status(503).json({ error: 'No fue posible enviar el código de verificación.' });
	}
});

router.post('/register/verify', async (request, response) => {
	const correo = String(request.body?.correo || '').trim().toLowerCase();
	const code = String(request.body?.code || '').trim().toUpperCase();
	if (!correo || !/^[A-Z2-9]{8}$/.test(code)) return response.status(400).json({ error: 'Ingresa el correo y el código de 8 caracteres.' });

	try {
		const codeHash = crypto.createHash('sha256').update(code).digest('hex');
		const [rows] = await pool.query(
			`SELECT * FROM tblh_registros_pendientes
			 WHERE correo = ? AND codigo_hash = ? AND usado = 0 AND fecha_expiracion > NOW() LIMIT 1`,
			[correo, codeHash],
		);
		const pending = rows[0];
		if (!pending) return response.status(400).json({ error: 'El código es incorrecto, expiró o ya fue utilizado.' });

		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();
			const [roleRows] = await connection.query("SELECT id FROM tbld_roles WHERE nombre = 'ESTUDIANTE' AND estado = 1 LIMIT 1");
			if (!roleRows.length) throw new Error('No existe el rol ESTUDIANTE.');
			await connection.query(
				`INSERT INTO tblh_usuarios
				 (id_tipo_documento, numero_documento, nombres, apellidos, correo, telefono, id_rol, id_institucion, usuario, password_hash)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[pending.id_tipo_documento, pending.numero_documento, pending.nombres, pending.apellidos, pending.correo, pending.telefono, roleRows[0].id, pending.id_institucion, pending.usuario, pending.password_hash],
			);
			await connection.query('DELETE FROM tblh_registros_pendientes WHERE id = ?', [pending.id]);
			await connection.commit();
		} catch (error) {
			await connection.rollback();
			if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'El usuario, correo o documento ya fue registrado.' });
			throw error;
		} finally {
			connection.release();
		}
		return response.status(201).json({ message: 'Cuenta creada correctamente. Ya puedes iniciar sesión.' });
	} catch (error) {
		console.error('Registration verification failed:', error.message);
		return response.status(500).json({ error: 'No fue posible completar el registro.' });
	}
});

router.post('/forgot-password', async (request, response) => {
	const identifier = String(request.body?.identifier || '').trim();
	const genericMessage = 'Si existe una cuenta con ese dato, recibirás un enlace para restablecer la contraseña.';
	if (!identifier) return response.status(400).json({ error: 'Ingresa tu usuario o correo.' });

	try {
		const [rows] = await pool.query(
			`SELECT id, nombres, correo FROM tblh_usuarios
			 WHERE estado = 1 AND correo IS NOT NULL
			 AND (usuario = ? OR correo = ?) LIMIT 1`,
			[identifier, identifier],
		);
		const user = rows[0];
		if (!user) return response.json({ message: genericMessage });

		const { rawToken, tokenHash } = createRecoveryToken();
		await pool.query('DELETE FROM tblh_recuperacion_claves WHERE id_usuario = ?', [user.id]);
		await pool.query(
			`INSERT INTO tblh_recuperacion_claves (id_usuario, token_hash, fecha_expiracion)
			 VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
			[user.id, tokenHash],
		);
		await sendRecoveryEmail(user, rawToken);
		return response.json({ message: genericMessage });
	} catch (error) {
		console.error('Password recovery failed:', error.message);
		return response.status(503).json({ error: 'El servicio de correo no está disponible. Contacta al administrador.' });
	}
});

router.post('/reset-password', async (request, response) => {
	const token = String(request.body?.token || '');
	const password = String(request.body?.password || '');
	if (!token || password.length < 8) {
		return response.status(400).json({ error: 'El enlace es inválido o la contraseña debe tener al menos 8 caracteres.' });
	}

	try {
		const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
		const [rows] = await pool.query(
			`SELECT id, id_usuario FROM tblh_recuperacion_claves
			 WHERE token_hash = ? AND usado = 0 AND fecha_expiracion > NOW() LIMIT 1`,
			[tokenHash],
		);
		const recovery = rows[0];
		if (!recovery) return response.status(400).json({ error: 'El enlace expiró o ya fue utilizado.' });

		const passwordHash = await bcrypt.hash(password, 12);
		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();
			await connection.query('UPDATE tblh_usuarios SET password_hash = ? WHERE id = ? AND estado = 1', [passwordHash, recovery.id_usuario]);
			await connection.query('UPDATE tblh_recuperacion_claves SET usado = 1, fecha_uso = NOW() WHERE id = ?', [recovery.id]);
			await connection.commit();
		} catch (error) {
			await connection.rollback();
			throw error;
		} finally {
			connection.release();
		}
		return response.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
	} catch (error) {
		console.error('Password reset failed:', error.message);
		return response.status(500).json({ error: 'No fue posible actualizar la contraseña.' });
	}
});

module.exports = router;
