const loginForm = document.getElementById('login-form');
const loginMessage = document.getElementById('login-message');
const loginSubmit = document.getElementById('login-submit');
const loginPassword = document.getElementById('login-password');
const passwordToggle = document.getElementById('password-toggle');

passwordToggle.addEventListener('click', () => {
	const isPassword = loginPassword.type === 'password';
	loginPassword.type = isPassword ? 'text' : 'password';
	passwordToggle.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
	passwordToggle.innerHTML = `<i class="ti ti-eye${isPassword ? '-off' : ''}" aria-hidden="true"></i>`;
});

loginForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	loginMessage.textContent = '';
	loginMessage.className = 'auth-message';
	loginSubmit.disabled = true;
	loginSubmit.classList.add('is-loading');
	loginSubmit.querySelector('span').textContent = 'Verificando acceso...';
	try {
		const response = await fetch('/api/auth/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ identifier: loginForm.elements.identifier.value, password: loginForm.elements.password.value }),
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.error || 'No fue posible iniciar sesión.');
		localStorage.setItem('rural40_user', JSON.stringify(result.user));
		window.location.assign(result.redirect);
	} catch (error) {
		loginMessage.textContent = error.message;
		loginMessage.className = 'auth-message is-error';
		loginSubmit.disabled = false;
		loginSubmit.classList.remove('is-loading');
		loginSubmit.querySelector('span').textContent = 'Entrar a mi espacio';
	}
});
