const { pool } = require('../db');

async function listPlants() {
	const [rows] = await pool.query(
		`SELECT id, nombre_comun, nombre_cientifico, tipo_cultivo
		 FROM tbld_plantas
		 WHERE estado = 1
		 ORDER BY nombre_comun ASC`,
	);
	return rows;
}

async function findActivePlant(plantId) {
	const [rows] = await pool.query('SELECT id FROM tbld_plantas WHERE id = ? AND estado = 1 LIMIT 1', [plantId]);
	return rows[0] || null;
}

async function listInstitutions() {
	const [rows] = await pool.query('SELECT id, nombre FROM tbld_instituciones WHERE estado = 1 ORDER BY nombre');
	return rows;
}

async function listDocumentTypes() {
	const [rows] = await pool.query('SELECT id, codigo, nombre FROM tbld_tipos_documentos WHERE estado = 1 ORDER BY id');
	return rows;
}

module.exports = { listPlants, findActivePlant, listInstitutions, listDocumentTypes };
