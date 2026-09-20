const express = require('express');
const { pool } = require('../db');

const router = express.Router();

function text(value) {
	return typeof value === 'string' ? value.trim() : '';
}

router.get('/plantas', async (request, response) => {
	try {
		const [rows] = await pool.query(
			`SELECT id, nombre_comun, nombre_cientifico, tipo_cultivo
			 FROM tbld_plantas
			 WHERE estado = 1
			 ORDER BY nombre_comun ASC`,
		);
		return response.json(rows);
	} catch (error) {
		console.error('Plant list failed:', error.message);
		return response.status(500).json({ error: 'No fue posible consultar las plantas.' });
	}
});

router.get('/docentes', async (request, response) => {
	try {
		const [rows] = await pool.query(
			`SELECT u.id, u.nombres, u.apellidos, u.correo, u.usuario
				 FROM tblh_usuarios u
				 JOIN tbld_roles r ON r.id = u.id_rol
				 WHERE u.estado = 1 AND r.nombre = 'DOCENTE'
				 ORDER BY u.apellidos ASC, u.nombres ASC`,
		);
		return response.json(rows);
	} catch (error) {
		console.error('Teacher list failed:', error.message);
		return response.status(500).json({ error: 'No fue posible consultar los docentes.' });
	}
});

router.get('/', async (request, response) => {
	const userId = Number(request.query.usuario_id);
	if (!Number.isInteger(userId) || userId <= 0) {
		return response.status(400).json({ error: 'usuario_id es obligatorio.' });
	}

	try {
		const [rows] = await pool.query(
			`SELECT p.id, p.nombre, p.descripcion, p.id_usuario, p.id_planta,
					pl.nombre_comun AS planta, p.id_dispositivo,
					p.id_docente,
					d.codigo_interno, p.fecha_inicio, p.fecha_fin, p.estado,
					u.nombres AS usuario_nombres, u.apellidos AS usuario_apellidos,
					docente.nombres AS docente_nombres, docente.apellidos AS docente_apellidos,
					i.nombre AS institucion_nombre
				 FROM tblh_proyectos p
				 JOIN tbld_plantas pl ON pl.id = p.id_planta
				 LEFT JOIN tbld_dispositivos d ON d.id = p.id_dispositivo
				 JOIN tblh_usuarios u ON u.id = p.id_usuario
				 LEFT JOIN tblh_usuarios docente ON docente.id = p.id_docente
				 LEFT JOIN tbld_instituciones i ON i.id = u.id_institucion
				 WHERE p.id_usuario = ? AND p.estado = 1
				 ORDER BY p.fecha_registro DESC`,
			[userId],
		);
		return response.json(rows);
	} catch (error) {
		console.error('Project list failed:', error.message);
		return response.status(500).json({ error: 'No fue posible consultar los proyectos.' });
	}
});

router.post('/', async (request, response) => {
	const userId = Number(request.body?.id_usuario);
	const teacherId = Number(request.body?.id_docente);
	const plantId = Number(request.body?.id_planta);
	const name = text(request.body?.nombre);
	const description = text(request.body?.descripcion) || null;
	const startDate = text(request.body?.fecha_inicio) || null;

	if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(teacherId) || teacherId <= 0 || !Number.isInteger(plantId) || plantId <= 0 || !name) {
		return response.status(400).json({ error: 'Usuario, docente, planta y nombre del proyecto son obligatorios.' });
	}

	try {
		const [teacherRows] = await pool.query(
			`SELECT u.id
				 FROM tblh_usuarios u
				 JOIN tbld_roles r ON r.id = u.id_rol
				 WHERE u.id = ? AND u.estado = 1 AND r.nombre = 'DOCENTE' LIMIT 1`,
			[teacherId],
		);
		if (teacherRows.length === 0) {
			return response.status(400).json({ error: 'El docente seleccionado no es válido.' });
		}

		const [plants] = await pool.query('SELECT id FROM tbld_plantas WHERE id = ? AND estado = 1 LIMIT 1', [plantId]);
		if (plants.length === 0) {
			return response.status(404).json({ error: 'La planta no existe o está inactiva.' });
		}

		const [result] = await pool.query(
			`INSERT INTO tblh_proyectos (nombre, descripcion, id_usuario, id_docente, id_planta, fecha_inicio)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[name, description, userId, teacherId, plantId, startDate],
		);
		return response.status(201).json({ id: result.insertId, nombre: name, id_usuario: userId, id_docente: teacherId, id_planta: plantId });
	} catch (error) {
		if (error.code === 'ER_DUP_ENTRY') {
			return response.status(409).json({ error: 'El proyecto o el dispositivo seleccionado ya existe.' });
		}
		console.error('Project creation failed:', error.message);
		return response.status(500).json({ error: 'No fue posible crear el proyecto.' });
	}
});

router.put('/:projectId', async (request, response) => {
	const projectId = Number(request.params.projectId);
	const userId = Number(request.body?.id_usuario);
	const teacherId = Number(request.body?.id_docente);
	const plantId = Number(request.body?.id_planta);
	const name = text(request.body?.nombre);
	const description = text(request.body?.descripcion) || null;
	if (!projectId || !userId || !teacherId || !plantId || !name) {
		return response.status(400).json({ error: 'Proyecto, docente, planta y nombre son obligatorios.' });
	}

	try {
		const [projectRows] = await pool.query(
			'SELECT id, id_dispositivo FROM tblh_proyectos WHERE id = ? AND id_usuario = ? AND estado = 1 LIMIT 1',
			[projectId, userId],
		);
		const project = projectRows[0];
		if (!project) return response.status(404).json({ error: 'Proyecto no encontrado.' });
		if (project.id_dispositivo) return response.status(409).json({ error: 'No puedes editar un proyecto con dispositivo vinculado.' });

		const [teacherRows] = await pool.query(
			`SELECT u.id FROM tblh_usuarios u JOIN tbld_roles r ON r.id = u.id_rol
			 WHERE u.id = ? AND u.estado = 1 AND r.nombre = 'DOCENTE' LIMIT 1`,
			[teacherId],
		);
		const [plantRows] = await pool.query('SELECT id FROM tbld_plantas WHERE id = ? AND estado = 1 LIMIT 1', [plantId]);
		if (!teacherRows.length || !plantRows.length) return response.status(400).json({ error: 'El docente o la planta seleccionada no son válidos.' });

		await pool.query('UPDATE tblh_proyectos SET nombre = ?, descripcion = ?, id_docente = ?, id_planta = ? WHERE id = ?', [name, description, teacherId, plantId, projectId]);
		return response.json({ id: projectId, nombre: name });
	} catch (error) {
		console.error('Project update failed:', error.message);
		return response.status(500).json({ error: 'No fue posible actualizar el proyecto.' });
	}
});

router.delete('/:projectId', async (request, response) => {
	const projectId = Number(request.params.projectId);
	const userId = Number(request.query.usuario_id || request.body?.id_usuario);
	if (!projectId || !userId) return response.status(400).json({ error: 'Proyecto y usuario son obligatorios.' });

	try {
		const [projectRows] = await pool.query(
			'SELECT id, id_dispositivo FROM tblh_proyectos WHERE id = ? AND id_usuario = ? AND estado = 1 LIMIT 1',
			[projectId, userId],
		);
		const project = projectRows[0];
		if (!project) return response.status(404).json({ error: 'Proyecto no encontrado.' });
		if (project.id_dispositivo) return response.status(409).json({ error: 'No puedes eliminar un proyecto con dispositivo vinculado.' });
		await pool.query('UPDATE tblh_proyectos SET estado = 0 WHERE id = ?', [projectId]);
		return response.json({ message: 'Proyecto eliminado correctamente.' });
	} catch (error) {
		console.error('Project deletion failed:', error.message);
		return response.status(500).json({ error: 'No fue posible eliminar el proyecto.' });
	}
});

router.get('/resumen/:projectId', async (request, response) => {
	const projectId = Number(request.params.projectId);
	if (!Number.isInteger(projectId) || projectId <= 0) {
		return response.status(400).json({ error: 'Identificador de proyecto inválido.' });
	}

	try {
		const [projectRows] = await pool.query(
			`SELECT p.id, p.nombre, p.descripcion, p.id_usuario, p.id_planta,
					p.id_docente,
					pl.nombre_comun AS planta, p.id_dispositivo,
					d.codigo_interno, d.mac_address, d.modelo, d.fecha_ultimo_contacto,
					p.configuracion_led, p.color_led, p.brillo_led, p.tipo_tierra, p.fecha_inicio, p.fecha_fin,
					u.nombres AS usuario_nombres, u.apellidos AS usuario_apellidos,
					docente.nombres AS docente_nombres, docente.apellidos AS docente_apellidos,
					i.nombre AS institucion_nombre
				 FROM tblh_proyectos p
				 JOIN tbld_plantas pl ON pl.id = p.id_planta
				 JOIN tblh_usuarios u ON u.id = p.id_usuario
				 LEFT JOIN tblh_usuarios docente ON docente.id = p.id_docente
				 LEFT JOIN tbld_instituciones i ON i.id = u.id_institucion
				 LEFT JOIN tbld_dispositivos d ON d.id = p.id_dispositivo
				 WHERE p.id = ? AND p.estado = 1
				 LIMIT 1`,
			[projectId],
		);

		if (projectRows.length === 0) {
			return response.status(404).json({ error: 'Proyecto no encontrado.' });
		}

		const project = projectRows[0];
		const [readingRows] = await pool.query(
			`SELECT temperatura_c, humedad_ambiente_pct, humedad_suelo_pct,
					intensidad_luz_lux, altura_planta_cm, agua_aplicada_ml,
					observacion, fecha_lectura
				 FROM tblh_registros_monitoreo
				 WHERE id_proyecto = ? AND estado = 1
				 ORDER BY fecha_lectura DESC
				 LIMIT 1`,
			[projectId],
		);

		return response.json({
			project: {
				id: project.id,
				id_usuario: project.id_usuario,
				id_docente: project.id_docente,
				nombre: project.nombre,
				descripcion: project.descripcion,
				id_planta: project.id_planta,
				planta: project.planta,
				id_dispositivo: project.id_dispositivo,
				codigo_interno: project.codigo_interno,
				mac_address: project.mac_address,
				modelo: project.modelo,
				fecha_ultimo_contacto: project.fecha_ultimo_contacto,
				configuracion_led: project.configuracion_led,
				color_led: project.color_led,
				brillo_led: project.brillo_led,
				tipo_tierra: project.tipo_tierra,
				fecha_inicio: project.fecha_inicio,
				fecha_fin: project.fecha_fin,
				usuario: {
					nombres: project.usuario_nombres,
					apellidos: project.usuario_apellidos,
				},
				docente: project.id_docente ? {
					nombres: project.docente_nombres,
					apellidos: project.docente_apellidos,
				} : null,
				institucion: project.institucion_nombre || null,
			},
			ultima_lectura: readingRows[0] || null,
		});
	} catch (error) {
		console.error('Project summary failed:', error.message);
		return response.status(500).json({ error: 'No fue posible consultar el resumen del proyecto.' });
	}
});

module.exports = router;
