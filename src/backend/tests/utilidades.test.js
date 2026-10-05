const assert = require('node:assert/strict');
const test = require('node:test');
const { toCsv } = require('../lib/csv');
const { escapeHtml } = require('../lib/html');
const { toColombiaDateTime, toMysqlDateTime } = require('../lib/fechas');

test('CSV con BOM, separador punto y coma y comillas escapadas', () => {
	const csv = toCsv(['Nombre', 'Nota'], [['Ana; "la mejor"', 5]]);
	assert.ok(csv.startsWith('﻿'));
	assert.equal(csv, '﻿Nombre;Nota\r\n"Ana; ""la mejor""";5\r\n');
});

test('CSV neutraliza texto que Excel interpretaría como fórmula', () => {
	const csv = toCsv(['Observación'], [['=HYPERLINK("x")'], [-3]]);
	assert.match(csv, /'=HYPERLINK/);
	assert.match(csv, /\r\n-3\r\n$/);
});

test('escapeHtml neutraliza etiquetas y comillas', () => {
	assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
	assert.equal(escapeHtml(null), '');
});

test('las fechas se generan en hora de Colombia', () => {
	assert.equal(toColombiaDateTime(new Date('2026-09-26T20:11:49Z')), '2026-09-26 15:11:49');
	assert.equal(toMysqlDateTime('2026-09-26 15:11:48'), '2026-09-26 15:11:48');
	assert.equal(toMysqlDateTime('no-es-fecha'), null);
});
