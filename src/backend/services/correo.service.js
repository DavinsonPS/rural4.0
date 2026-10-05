const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const { escapeHtml } = require('../lib/html');

// Correos de la plataforma (registro, recuperación e invitación). Usa el SMTP del .env.

function appUrl() {
	return process.env.APP_URL || 'http://localhost:3000';
}

function sender() {
	return process.env.MAIL_FROM || `"Rural 4.0" <${process.env.EMAIL_USER}>`;
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

// Token de un solo uso: el correo lleva el valor crudo y la BD guarda solo su SHA-256.
function createAccessToken() {
	const rawToken = crypto.randomBytes(32).toString('hex');
	const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
	return { rawToken, tokenHash };
}

function resetUrl(rawToken, { invitation = false } = {}) {
	return `${appUrl()}/restablecer.html?token=${rawToken}${invitation ? '&invitacion=1' : ''}`;
}

async function sendRecoveryEmail(user, rawToken) {
	const url = resetUrl(rawToken);
	await createMailTransporter().sendMail({
		from: sender(),
		to: user.correo,
		subject: 'Recuperación de contraseña | Rural 4.0',
		html: `<p>Hola, ${escapeHtml(user.nombres)}.</p><p>Recibimos una solicitud para cambiar tu contraseña de Rural 4.0.</p><p><a href="${escapeHtml(url)}">Crear una nueva contraseña</a></p><p>Este enlace vence en 30 minutos y solo puede usarse una vez.</p><p>Si no solicitaste este cambio, puedes ignorar este correo.</p>`,
	});
}

async function sendVerificationEmail(user, code) {
	await createMailTransporter().sendMail({
		from: sender(),
		to: user.correo,
		subject: 'Código de verificación | Rural 4.0',
		html: `<p>Hola, ${escapeHtml(user.nombres)}.</p><p>Usa este código para confirmar tu correo y terminar tu registro en Rural 4.0:</p><p style="font-size:24px;font-weight:bold;letter-spacing:6px">${escapeHtml(code)}</p><p>El código vence en 15 minutos y solo puede usarse una vez.</p><p>Si no solicitaste este registro, puedes ignorar este correo.</p>`,
	});
}

async function sendInvitationEmail(user, rawToken, { roleLabel, hours }) {
	const url = resetUrl(rawToken, { invitation: true });
	await createMailTransporter().sendMail({
		from: sender(),
		to: user.correo,
		subject: 'Tu cuenta en Rural 4.0',
		html: `<p>Hola, ${escapeHtml(user.nombres)}.</p><p>Se creó tu cuenta de <strong>${escapeHtml(roleLabel)}</strong> en Rural 4.0. Tu usuario es <strong>${escapeHtml(user.usuario)}</strong>.</p><p><a href="${escapeHtml(url)}">Crea tu contraseña para entrar</a></p><p>Este enlace vence en ${hours} horas y solo puede usarse una vez. Si vence, pide al administrador que te envíe uno nuevo.</p>`,
	});
}

module.exports = { createAccessToken, resetUrl, sendRecoveryEmail, sendVerificationEmail, sendInvitationEmail };
