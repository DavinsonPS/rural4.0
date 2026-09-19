const crypto = require('node:crypto');

const cookieName = 'rural40_session';
const sessionSecret = process.env.SESSION_SECRET || 'cambia-esta-clave-en-produccion';

function encode(value) {
	return Buffer.from(value).toString('base64url');
}

function sign(payload) {
	return crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
}

function createSessionToken(user) {
	const payload = encode(JSON.stringify({
		id: user.id,
		rol: user.rol,
		exp: Date.now() + 1000 * 60 * 60 * 8,
	}));
	return `${payload}.${sign(payload)}`;
}

function readSession(request) {
	const cookies = String(request.headers.cookie || '').split(';').reduce((result, item) => {
		const separator = item.indexOf('=');
		if (separator > 0) result[item.slice(0, separator).trim()] = item.slice(separator + 1).trim();
		return result;
	}, {});
	const token = cookies[cookieName];
	if (!token) return null;
	const [payload, signature] = token.split('.');
	const expectedSignature = sign(payload);
	if (!payload || !signature || signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null;
	try {
		const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
		return session.exp > Date.now() ? session : null;
	} catch (error) {
		return null;
	}
}

function setSessionCookie(response, request, user) {
	const forwardedProtocol = request.headers['x-forwarded-proto'];
	const isSecure = forwardedProtocol === 'https' || request.secure;
	const flags = [`${cookieName}=${createSessionToken(user)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=28800'];
	if (isSecure) flags.push('Secure');
	response.setHeader('Set-Cookie', flags.join('; '));
}

function clearSessionCookie(response) {
	response.setHeader('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

module.exports = { readSession, setSessionCookie, clearSessionCookie };
