const resetParams = new URLSearchParams(window.location.search);
const resetToken = resetParams.get('token');

// Cuando el enlace viene de una invitación del administrador, la página da la bienvenida
// en lugar de hablar de "restablecer".
if (resetParams.get('invitacion') === '1') {
	document.title = 'Rural 4.0 | Activa tu cuenta';
	document.querySelector('.login-kicker').textContent = 'Bienvenida';
	document.getElementById('reset-title').innerHTML = 'Activa tu<br><strong>cuenta.</strong>';
	document.querySelector('.intro-copy p').textContent = 'Crea tu contraseña para empezar a acompañar los proyectos.';
	document.querySelector('.login-panel-heading .eyebrow').textContent = 'Primer ingreso';
	document.querySelector('.login-panel-heading h2').textContent = 'Crea tu contraseña';
	document.querySelector('.login-panel-heading p').textContent = 'Usa al menos 8 caracteres. El enlace de invitación solo puede utilizarse una vez.';
}
const resetForm = document.getElementById('reset-form');
const resetMessage = document.getElementById('reset-message');
const resetSubmit = document.getElementById('reset-submit');

resetForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	resetMessage.textContent = '';
	resetMessage.className = 'login-message';
	if (!resetToken) {
		resetMessage.textContent = 'El enlace de recuperación no es válido.';
		resetMessage.className = 'login-message is-error';
		return;
	}
	if (resetForm.elements.password.value !== resetForm.elements.confirmation.value) {
		resetMessage.textContent = 'Las contraseñas no coinciden.';
		resetMessage.className = 'login-message is-error';
		return;
	}
	resetSubmit.disabled = true;
	try {
		const response = await fetch('/api/auth/reset-password', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token: resetToken, password: resetForm.elements.password.value }),
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.error || 'No fue posible actualizar la contraseña.');
		resetMessage.textContent = result.message;
		resetMessage.className = 'login-message is-success';
		resetForm.reset();
		setTimeout(() => window.location.assign('/'), 1800);
	} catch (error) {
		resetMessage.textContent = error.message;
		resetMessage.className = 'login-message is-error';
		resetSubmit.disabled = false;
	}
});
