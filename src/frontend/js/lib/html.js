const replacements = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Todo texto que venga de usuarios o de la API debe pasar por aquí antes de ir a innerHTML.
export function escapeHtml(value) {
	return String(value ?? '').replace(/[&<>"']/g, (character) => replacements[character]);
}
