// Utilidades de las pruebas de extremo a extremo contra el servidor LOCAL (npm run dev + Docker).
// Cada corrida usa identificadores únicos, así se pueden repetir sin limpiar la base.
export const BASE = process.env.RURAL_BASE || 'http://localhost:3000';
export const PASSWORD = 'Rural40-local';
export const PROVISIONING_KEY = 'provision-local';
export const REGISTRATION_KEY = 'registro-local';
export const RUN = Date.now().toString(36).slice(-6);

// MAC única por corrida y por "número" de dispositivo.
export function uniqueMac(index) {
	const hex = (Date.now() + index * 7919).toString(16).padStart(12, '0').slice(-10);
	return ['02', ...hex.match(/.{2}/g)].join(':').toUpperCase();
}

export function createReport(title) {
	const rows = [];
	return {
		check(name, condition, detail = '') {
			rows.push({ ok: Boolean(condition), name, detail });
		},
		print() {
			console.log(`\n=== ${title} ===`);
			rows.forEach((row) => console.log(`${row.ok ? 'OK   ' : 'FALLA'} ${row.name}${row.detail ? ` → ${String(row.detail).slice(0, 160)}` : ''}`));
			const failed = rows.filter((row) => !row.ok).length;
			console.log(`${rows.length - failed}/${rows.length} correctas`);
			return failed;
		},
	};
}

export async function login(identifier, password = PASSWORD) {
	const response = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier, password }) });
	const body = await response.json();
	return { status: response.status, cookie: (response.headers.get('set-cookie') || '').split(';')[0], body, setCookie: response.headers.get('set-cookie') };
}

export async function call(cookie, path, { method = 'GET', body, headers = {}, raw } = {}) {
	const init = { method, headers: { ...(cookie ? { cookie } : {}), ...headers }, redirect: 'manual' };
	if (raw) {
		init.body = raw;
		init.headers['content-type'] = init.headers['content-type'] || 'image/jpeg';
	} else if (body !== undefined) {
		init.body = JSON.stringify(body);
		init.headers['content-type'] = 'application/json';
	}
	const response = await fetch(`${BASE}${path}`, init);
	const type = response.headers.get('content-type') || '';
	const buffer = Buffer.from(await response.arrayBuffer());
	let json = null;
	if (type.includes('json')) { try { json = JSON.parse(buffer.toString('utf8')); } catch { /* sin cuerpo */ } }
	return { status: response.status, body: json, buffer, type };
}

export function todayLocal() {
	return new Date().toLocaleDateString('en-CA');
}

export function localInput(date) {
	const pad = (number) => String(number).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
