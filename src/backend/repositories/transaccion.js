const { pool } = require('../db');

// Ejecuta work(connection) dentro de una transacción; hace rollback ante cualquier error.
async function withTransaction(work) {
	const connection = await pool.getConnection();
	try {
		await connection.beginTransaction();
		const result = await work(connection);
		await connection.commit();
		return result;
	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		connection.release();
	}
}

module.exports = { withTransaction };
