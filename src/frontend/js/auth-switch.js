const authShell = document.getElementById('auth-shell');
const loginView = document.getElementById('login-view');
const registerView = document.getElementById('register-view');
const recoveryView = document.getElementById('recovery-view');
const loginCopy = document.getElementById('auth-copy-login');
const registerCopy = document.getElementById('auth-copy-register');
const recoveryCopy = document.getElementById('auth-copy-recovery');
const footerText = document.getElementById('auth-footer-text');
const showRegister = document.getElementById('show-register');
const showLogin = document.getElementById('show-login');
const showRecovery = document.getElementById('show-recovery');
const showLoginRecovery = document.getElementById('show-login-recovery');
let transitionTimer;
let currentView = window.location.hash === '#registro' ? 'register' : window.location.hash === '#recuperar' ? 'recovery' : 'login';

const views = { login: loginView, register: registerView, recovery: recoveryView };
const copies = { login: loginCopy, register: registerCopy, recovery: recoveryCopy };
const footerLabels = {
	login: 'Monitoreo · Aprendizaje · Comunidad',
	register: 'Aprender · Verificar · Crecer',
	recovery: 'Acceso · Confianza · Continuidad',
};

function setAuthView(view, animate = true) {
	const activeView = views[currentView];
	const nextView = views[view];
	if (!animate) {
		authShell.classList.toggle('is-register', view !== 'login');
		Object.entries(views).forEach(([name, element]) => { element.hidden = name !== view; });
		Object.entries(copies).forEach(([name, element]) => { element.hidden = name !== view; });
		footerText.textContent = footerLabels[view];
		currentView = view;
		return;
	}

	window.clearTimeout(transitionTimer);
	activeView.classList.remove('is-entering');
	activeView.classList.add('is-leaving');
	authShell.classList.toggle('is-register', view !== 'login');
	Object.entries(copies).forEach(([name, element]) => { element.hidden = name !== view; });
	footerText.textContent = footerLabels[view];
	transitionTimer = window.setTimeout(() => {
		activeView.hidden = true;
		activeView.classList.remove('is-leaving');
		nextView.hidden = false;
		nextView.classList.remove('is-entering');
		window.requestAnimationFrame(() => nextView.classList.add('is-entering'));
	}, 430);
	currentView = view;
	window.history.replaceState(null, '', `#${view === 'register' ? 'registro' : view === 'recovery' ? 'recuperar' : 'login'}`);
}

showRegister.addEventListener('click', (event) => {
	event.preventDefault();
	setAuthView('register');
});

showLogin.addEventListener('click', (event) => {
	event.preventDefault();
	setAuthView('login');
});

showRecovery.addEventListener('click', (event) => {
	event.preventDefault();
	setAuthView('recovery');
});

showLoginRecovery.addEventListener('click', (event) => {
	event.preventDefault();
	setAuthView('login');
});

setAuthView(currentView, false);
