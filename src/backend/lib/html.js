const replacements = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value) {
	return String(value ?? '').replace(/[&<>"']/g, (character) => replacements[character]);
}

module.exports = { escapeHtml };
