const teacherUser = JSON.parse(localStorage.getItem('rural40_user') || 'null');

if (!teacherUser || teacherUser.rol === 'ESTUDIANTE') {
	window.location.replace('/');
} else {
	document.getElementById('teacher-name').textContent = `${teacherUser.nombres} ${teacherUser.apellidos}`.trim();
}

document.getElementById('logout-button').addEventListener('click', async () => {
	await fetch('/api/auth/logout', { method: 'POST' });
	localStorage.removeItem('rural40_user');
	window.location.replace('/');
});
