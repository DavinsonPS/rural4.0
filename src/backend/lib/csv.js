// CSV para Excel en español: separador ';', BOM UTF-8 y protección contra fórmulas.
function cell(value) {
	if (value === null || value === undefined) return '';
	let textValue = value instanceof Date ? value.toISOString() : String(value);
	if (typeof value === 'string' && /^[=+\-@\t\r]/.test(textValue)) textValue = `'${textValue}`;
	return /[;"\r\n]/.test(textValue) ? `"${textValue.replaceAll('"', '""')}"` : textValue;
}

function toCsv(headers, rows) {
	const lines = [headers.map(cell).join(';'), ...rows.map((row) => row.map(cell).join(';'))];
	return `﻿${lines.join('\r\n')}\r\n`;
}

module.exports = { toCsv };
