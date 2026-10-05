// Genera el INSERT para crear una cuenta de DOCENTE o ADMINISTRADOR, listo para importar en
// phpMyAdmin. Úsalo para el PRIMER administrador; después, las cuentas se crean desde admin.html.
// No se conecta a la base de datos: solo imprime el SQL con la contraseña ya cifrada.
//
// Uso (desde src/backend, en local):
//   npm run docente:crear -- --nombres "María" --apellidos "Ruiz" --usuario marruiz \
//     --correo maria@colegio.edu.co --documento 1000000002 --tipo CC --institucion 1 --password "ClaveSegura123"
//   Para un administrador agrega: --rol ADMINISTRADOR
const bcrypt = require('bcryptjs');

function readArguments(argv) {
	const values = {};
	for (let index = 0; index < argv.length; index += 1) {
		if (argv[index].startsWith('--')) values[argv[index].slice(2)] = argv[index + 1];
	}
	return values;
}

function sqlString(value) {
	return `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
}

const args = readArguments(process.argv.slice(2));
const required = ['nombres', 'apellidos', 'usuario', 'correo', 'documento', 'institucion', 'password'];
const missing = required.filter((name) => !args[name]);
if (missing.length) {
	console.error(`Faltan argumentos: ${missing.map((name) => `--${name}`).join(', ')}`);
	process.exit(1);
}
if (String(args.password).length < 8) {
	console.error('La contraseña debe tener al menos 8 caracteres.');
	process.exit(1);
}
if (!Number.isInteger(Number(args.institucion))) {
	console.error('--institucion debe ser el id numérico de tbld_instituciones.');
	process.exit(1);
}

const passwordHash = bcrypt.hashSync(String(args.password), 12);
const documentType = args.tipo || 'CC';
const role = String(args.rol || 'DOCENTE').toUpperCase();
if (!['DOCENTE', 'ADMINISTRADOR'].includes(role)) {
	console.error('--rol debe ser DOCENTE o ADMINISTRADOR.');
	process.exit(1);
}

console.log(`-- Crear ${role.toLowerCase()} ${args.usuario} (generado ${new Date().toISOString()})
INSERT INTO tblh_usuarios
  (id_tipo_documento, numero_documento, nombres, apellidos, correo, telefono, id_rol, id_institucion, usuario, password_hash)
SELECT td.id, ${sqlString(args.documento)}, ${sqlString(args.nombres)}, ${sqlString(args.apellidos)},
  ${sqlString(String(args.correo).toLowerCase())}, ${args.telefono ? sqlString(args.telefono) : 'NULL'}, r.id, ${Number(args.institucion)},
  ${sqlString(args.usuario)}, ${sqlString(passwordHash)}
FROM tbld_tipos_documentos td
JOIN tbld_roles r ON r.nombre = ${sqlString(role)} AND r.estado = 1
WHERE td.codigo = ${sqlString(documentType)} AND td.estado = 1;`);
