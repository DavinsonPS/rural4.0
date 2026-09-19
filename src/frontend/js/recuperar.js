const recoveryForm = document.getElementById('recovery-form');
const recoveryMessage = document.getElementById('recovery-message');
const recoverySubmit = document.getElementById('recovery-submit');

recoveryForm?.addEventListener('submit', async (event) => {
	event.preventDefault();
	recoveryMessage.textContent = '';
	recoveryMessage.className = 'auth-message login-message';
	recoverySubmit.disabled = true;
	recoverySubmit.querySelector('span').textContent = 'Enviando...';
	try {
		const response = await fetch('/api/auth/forgot-password', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ identifier: recoveryForm.elements.identifier.value }),
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.error || 'No fue posible enviar el enlace.');
		recoveryMessage.textContent = result.message;
		recoveryMessage.className = 'auth-message login-message is-success';
		recoveryForm.reset();
	} catch (error) {
		recoveryMessage.textContent = error.message;
		recoveryMessage.className = 'auth-message login-message is-error';
	} finally {
		recoverySubmit.disabled = false;
		recoverySubmit.querySelector('span').textContent = 'Enviar enlace';
	}
});
