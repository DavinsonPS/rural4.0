const registrationForm = document.getElementById('registration-form');
const verificationForm = document.getElementById('verification-form');
const registrationMessage = document.getElementById('registration-message');
const verificationMessage = document.getElementById('verification-message');
const registrationSubmit = document.getElementById('registration-submit');
const verificationSubmit = document.getElementById('verification-submit');
const verificationEmail = document.getElementById('verification-email');
const pendingRegistration = {};

function showMessage(element, text, success = false) {
	element.textContent = text;
	element.className = `auth-message login-message ${success ? 'is-success' : 'is-error'}`;
}

async function loadCatalogs() {
	try {
		const [typesResponse, institutionsResponse] = await Promise.all([
			fetch('/api/auth/tipos-documento'),
			fetch('/api/auth/instituciones'),
		]);
		const types = await typesResponse.json();
		const institutions = await institutionsResponse.json();
		document.getElementById('register-document-type').innerHTML = '<option value="">Selecciona una opción</option>'
			+ types.map((item) => `<option value="${item.id}">${item.codigo} · ${item.nombre}</option>`).join('');
		document.getElementById('register-institution').innerHTML = '<option value="">Selecciona una institución</option>'
			+ institutions.map((item) => `<option value="${item.id}">${item.nombre}</option>`).join('');
	} catch (error) {
		showMessage(registrationMessage, 'No fue posible cargar los datos del formulario.');
	}
}

registrationForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const formData = new FormData(registrationForm);
	if (formData.get('password') !== formData.get('confirmation')) {
		showMessage(registrationMessage, 'Las contraseñas no coinciden.');
		return;
	}

	Object.assign(pendingRegistration, Object.fromEntries(formData));
	delete pendingRegistration.confirmation;
	registrationSubmit.disabled = true;
	try {
		const response = await fetch('/api/auth/register/request', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(pendingRegistration),
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.error || 'No fue posible iniciar el registro.');
		verificationEmail.textContent = pendingRegistration.correo;
		registrationForm.hidden = true;
		verificationForm.hidden = false;
	} catch (error) {
		showMessage(registrationMessage, error.message);
		registrationSubmit.disabled = false;
	}
});

verificationForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	verificationSubmit.disabled = true;
	try {
		const response = await fetch('/api/auth/register/verify', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				correo: pendingRegistration.correo,
				code: document.getElementById('verification-code').value,
			}),
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.error || 'No fue posible confirmar el correo.');
		showMessage(verificationMessage, result.message, true);
		setTimeout(() => window.location.assign('/'), 1800);
	} catch (error) {
		showMessage(verificationMessage, error.message);
		verificationSubmit.disabled = false;
	}
});

document.getElementById('back-to-registration').addEventListener('click', () => {
	verificationForm.hidden = true;
	registrationForm.hidden = false;
	verificationSubmit.disabled = false;
});

loadCatalogs();
