-- Rural 4.0 - Inicialización centralizada de la base de datos
-- Este archivo sustituye a los scripts de esquema y seeds dispersos.
-- Cambia los valores de ejemplo antes de entrar a producción.

CREATE DATABASE IF NOT EXISTS rural40_db
	CHARACTER SET utf8mb4
	COLLATE utf8mb4_unicode_ci;

USE rural40_db;

-- ================================================================
-- Usuario de conexión de la aplicación
-- Ajusta la contraseña antes de ejecutar en producción.
-- ================================================================
CREATE USER IF NOT EXISTS 'BD_SYSTEM_RURAL40'@'localhost'
IDENTIFIED BY 'CHANGE_ME';

GRANT SELECT, INSERT, UPDATE, DELETE
ON rural40_db.*
TO 'BD_SYSTEM_RURAL40'@'localhost';

FLUSH PRIVILEGES;

-- ================================================================
-- Dimensiones
-- Todas las dimensiones incluyen auditoría básica y estado lógico.
-- ================================================================
CREATE TABLE IF NOT EXISTS tbld_roles (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	nombre VARCHAR(50) NOT NULL,
	descripcion VARCHAR(255) NULL,
	fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	fecha_update DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	estado TINYINT(1) NOT NULL DEFAULT 1,
	PRIMARY KEY (id),
	UNIQUE KEY uk_tbld_roles_nombre (nombre),
	KEY idx_tbld_roles_estado (estado)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbld_instituciones (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	nombre VARCHAR(150) NOT NULL,
	codigo_dane VARCHAR(20) NULL,
	direccion VARCHAR(255) NULL,
	municipio VARCHAR(100) NULL,
	departamento VARCHAR(100) NULL,
	correo VARCHAR(150) NULL,
	telefono VARCHAR(30) NULL,
	fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	fecha_update DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	estado TINYINT(1) NOT NULL DEFAULT 1,
	PRIMARY KEY (id),
	UNIQUE KEY uk_tbld_instituciones_codigo_dane (codigo_dane),
	KEY idx_tbld_instituciones_estado (estado)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbld_tipos_documentos (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	codigo VARCHAR(20) NOT NULL,
	nombre VARCHAR(80) NOT NULL,
	descripcion VARCHAR(255) NULL,
	fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	fecha_update DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	estado TINYINT(1) NOT NULL DEFAULT 1,
	PRIMARY KEY (id),
	UNIQUE KEY uk_tbld_tipos_documentos_codigo (codigo),
	UNIQUE KEY uk_tbld_tipos_documentos_nombre (nombre),
	KEY idx_tbld_tipos_documentos_estado (estado)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbld_plantas (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	nombre_comun VARCHAR(100) NOT NULL,
	nombre_cientifico VARCHAR(150) NULL,
	tipo_cultivo VARCHAR(100) NULL,
	descripcion TEXT NULL,
	fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	fecha_update DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	estado TINYINT(1) NOT NULL DEFAULT 1,
	PRIMARY KEY (id),
	KEY idx_tbld_plantas_nombre_comun (nombre_comun),
	KEY idx_tbld_plantas_estado (estado)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbld_dispositivos (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	codigo_interno VARCHAR(50) NOT NULL,
	serial VARCHAR(100) NULL,
	mac_address VARCHAR(17) NULL,
	modelo VARCHAR(100) NULL,
	fabricante VARCHAR(100) NULL,
	version_firmware VARCHAR(30) NULL,
	fecha_ultimo_contacto DATETIME NULL,
	codigo_vinculacion CHAR(8) NULL,
	api_key_hash CHAR(64) NULL,
	fecha_vinculacion DATETIME NULL,
	fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	fecha_update DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	estado TINYINT(1) NOT NULL DEFAULT 1,
	PRIMARY KEY (id),
	UNIQUE KEY uk_tbld_dispositivos_codigo_interno (codigo_interno),
	UNIQUE KEY uk_tbld_dispositivos_serial (serial),
	UNIQUE KEY uk_tbld_dispositivos_mac (mac_address),
	UNIQUE KEY uk_tbld_dispositivos_codigo_vinculacion (codigo_vinculacion),
	KEY idx_tbld_dispositivos_estado (estado)
) ENGINE=InnoDB;

-- ================================================================
-- Hechos y relaciones
-- ================================================================
CREATE TABLE IF NOT EXISTS tblh_usuarios (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	id_tipo_documento INT UNSIGNED NOT NULL,
	numero_documento VARCHAR(30) NOT NULL,
	nombres VARCHAR(100) NOT NULL,
	apellidos VARCHAR(100) NOT NULL,
	correo VARCHAR(150) NULL,
	telefono VARCHAR(30) NULL,
	id_rol INT UNSIGNED NOT NULL,
	id_institucion INT UNSIGNED NOT NULL,
	usuario VARCHAR(80) NOT NULL,
	password_hash VARCHAR(255) NOT NULL,
	ultimo_acceso DATETIME NULL,
	fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	fecha_update DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	estado TINYINT(1) NOT NULL DEFAULT 1,
	PRIMARY KEY (id),
	UNIQUE KEY uk_tblh_usuarios_documento (id_tipo_documento, numero_documento),
	UNIQUE KEY uk_tblh_usuarios_usuario (usuario),
	UNIQUE KEY uk_tblh_usuarios_correo (correo),
	KEY idx_tblh_usuarios_tipo_documento (id_tipo_documento),
	KEY idx_tblh_usuarios_rol (id_rol),
	KEY idx_tblh_usuarios_institucion (id_institucion),
	KEY idx_tblh_usuarios_estado (estado),
	CONSTRAINT fk_tblh_usuarios_tipo_documento
		FOREIGN KEY (id_tipo_documento) REFERENCES tbld_tipos_documentos (id),
	CONSTRAINT fk_tblh_usuarios_rol
		FOREIGN KEY (id_rol) REFERENCES tbld_roles (id),
	CONSTRAINT fk_tblh_usuarios_institucion
		FOREIGN KEY (id_institucion) REFERENCES tbld_instituciones (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tblh_proyectos (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	nombre VARCHAR(150) NOT NULL,
	descripcion TEXT NULL,
	id_usuario INT UNSIGNED NOT NULL,
	id_docente INT UNSIGNED NULL,
	id_planta INT UNSIGNED NOT NULL,
	id_dispositivo INT UNSIGNED NULL,
	configuracion_led VARCHAR(30) NULL,
	color_led VARCHAR(20) NOT NULL DEFAULT 'rojo',
	brillo_led TINYINT UNSIGNED NOT NULL DEFAULT 255,
	tipo_tierra VARCHAR(100) NULL,
	fecha_inicio DATE NULL,
	fecha_fin DATE NULL,
	fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	fecha_update DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	estado TINYINT(1) NOT NULL DEFAULT 1,
	PRIMARY KEY (id),
	UNIQUE KEY uk_tblh_proyectos_usuario (id_usuario),
	UNIQUE KEY uk_tblh_proyectos_dispositivo (id_dispositivo),
	KEY idx_tblh_proyectos_usuario (id_usuario),
	KEY idx_tblh_proyectos_docente (id_docente),
	KEY idx_tblh_proyectos_planta (id_planta),
	KEY idx_tblh_proyectos_estado (estado),
	CONSTRAINT fk_tblh_proyectos_usuario
		FOREIGN KEY (id_usuario) REFERENCES tblh_usuarios (id),
	CONSTRAINT fk_tblh_proyectos_docente
		FOREIGN KEY (id_docente) REFERENCES tblh_usuarios (id),
	CONSTRAINT fk_tblh_proyectos_planta
		FOREIGN KEY (id_planta) REFERENCES tbld_plantas (id),
	CONSTRAINT fk_tblh_proyectos_dispositivo
		FOREIGN KEY (id_dispositivo) REFERENCES tbld_dispositivos (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tblh_fotografias_monitoreo (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	id_proyecto INT UNSIGNED NOT NULL,
	id_dispositivo INT UNSIGNED NOT NULL,
	fecha_fotografia DATETIME NOT NULL,
	ruta_archivo VARCHAR(500) NOT NULL,
	nombre_archivo VARCHAR(255) NOT NULL,
	tamano_bytes INT UNSIGNED NOT NULL,
	fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	fecha_update DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	estado TINYINT(1) NOT NULL DEFAULT 1,
	PRIMARY KEY (id),
	KEY idx_tblh_fotografias_proyecto_fecha (id_proyecto, fecha_fotografia),
	KEY idx_tblh_fotografias_dispositivo_fecha (id_dispositivo, fecha_fotografia),
	CONSTRAINT fk_tblh_fotografias_proyecto FOREIGN KEY (id_proyecto) REFERENCES tblh_proyectos (id),
	CONSTRAINT fk_tblh_fotografias_dispositivo FOREIGN KEY (id_dispositivo) REFERENCES tbld_dispositivos (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tblh_registros_monitoreo (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	id_proyecto INT UNSIGNED NOT NULL,
	id_dispositivo INT UNSIGNED NOT NULL,
	fecha_lectura DATETIME NOT NULL,
	temperatura_c DECIMAL(5,2) NULL,
	humedad_ambiente_pct DECIMAL(5,2) NULL,
	humedad_suelo_pct DECIMAL(5,2) NULL,
	intensidad_luz_lux DECIMAL(10,2) NULL,
	altura_planta_cm DECIMAL(8,2) NULL,
	agua_aplicada_ml DECIMAL(10,2) NULL,
	observacion VARCHAR(500) NULL,
	fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	fecha_update DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	estado TINYINT(1) NOT NULL DEFAULT 1,
	PRIMARY KEY (id),
	KEY idx_tblh_monitoreo_proyecto_fecha (id_proyecto, fecha_lectura),
	KEY idx_tblh_monitoreo_dispositivo_fecha (id_dispositivo, fecha_lectura),
	KEY idx_tblh_monitoreo_estado (estado),
	CONSTRAINT fk_tblh_monitoreo_proyecto
		FOREIGN KEY (id_proyecto) REFERENCES tblh_proyectos (id),
	CONSTRAINT fk_tblh_monitoreo_dispositivo
		FOREIGN KEY (id_dispositivo) REFERENCES tbld_dispositivos (id),
	CONSTRAINT chk_tblh_monitoreo_temperatura
		CHECK (temperatura_c IS NULL OR temperatura_c BETWEEN -50 AND 100),
	CONSTRAINT chk_tblh_monitoreo_humedad_ambiente
		CHECK (humedad_ambiente_pct IS NULL OR humedad_ambiente_pct BETWEEN 0 AND 100),
	CONSTRAINT chk_tblh_monitoreo_humedad_suelo
		CHECK (humedad_suelo_pct IS NULL OR humedad_suelo_pct BETWEEN 0 AND 100),
	CONSTRAINT chk_tblh_monitoreo_agua
		CHECK (agua_aplicada_ml IS NULL OR agua_aplicada_ml >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tblh_bitacoras_diarias (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	id_proyecto INT UNSIGNED NOT NULL,
	fecha_bitacora DATE NOT NULL,
	temperatura_ambiente_c DECIMAL(5,2) NULL,
	agua_aplicada_ml DECIMAL(10,2) NULL,
	hora_riego TIME NULL,
	humedad_suelo_pct DECIMAL(5,2) NULL,
	color_hojas VARCHAR(50) NULL,
	observacion VARCHAR(500) NULL,
	fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	fecha_update DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	estado TINYINT(1) NOT NULL DEFAULT 1,
	PRIMARY KEY (id),
	UNIQUE KEY uk_tblh_bitacoras_proyecto_fecha (id_proyecto, fecha_bitacora),
	KEY idx_tblh_bitacoras_proyecto_fecha (id_proyecto, fecha_bitacora),
	CONSTRAINT fk_tblh_bitacoras_proyecto
		FOREIGN KEY (id_proyecto) REFERENCES tblh_proyectos (id),
	CONSTRAINT chk_tblh_bitacoras_temperatura
		CHECK (temperatura_ambiente_c IS NULL OR temperatura_ambiente_c BETWEEN 0 AND 50),
	CONSTRAINT chk_tblh_bitacoras_humedad
		CHECK (humedad_suelo_pct IS NULL OR humedad_suelo_pct BETWEEN 0 AND 100),
	CONSTRAINT chk_tblh_bitacoras_agua
		CHECK (agua_aplicada_ml IS NULL OR agua_aplicada_ml >= 0)
) ENGINE=InnoDB;

-- ================================================================
-- Datos básicos iniciales
-- ================================================================
INSERT INTO tbld_tipos_documentos (codigo, nombre, descripcion)
VALUES
	('CC', 'Cedula de ciudadania', 'Documento de identificacion para ciudadanos colombianos mayores de edad'),
	('TI', 'Tarjeta de identidad', 'Documento de identificacion para menores de edad'),
	('RC', 'Registro civil', 'Documento de identificacion para ninos y ninas'),
	('CE', 'Cedula de extranjeria', 'Documento de identificacion para personas extranjeras residentes en Colombia'),
	('PAS', 'Pasaporte', 'Documento de viaje e identificacion internacional')
ON DUPLICATE KEY UPDATE
	nombre = VALUES(nombre),
	descripcion = VALUES(descripcion),
	estado = 1;

INSERT INTO tbld_roles (nombre, descripcion)
VALUES
	('ESTUDIANTE', 'Responsable del proyecto y del registro de observaciones'),
	('DOCENTE', 'Consulta y acompana los proyectos de sus estudiantes'),
	('ADMINISTRADOR', 'Administra usuarios, instituciones, dispositivos y configuracion del sistema')
ON DUPLICATE KEY UPDATE
	descripcion = VALUES(descripcion),
	estado = 1;

INSERT INTO tbld_plantas (nombre_comun, nombre_cientifico, tipo_cultivo, descripcion)
SELECT 'Frijol', 'Phaseolus vulgaris', 'Leguminosa', 'Cultivo base para pruebas iniciales'
WHERE NOT EXISTS (
	SELECT 1 FROM tbld_plantas WHERE nombre_comun = 'Frijol'
);

INSERT INTO tbld_instituciones (
	nombre,
	codigo_dane,
	direccion,
	municipio,
	departamento,
	correo,
	telefono,
	estado
)
SELECT
	'Institucion de ejemplo',
	NULL,
	'Calle 1 No. 2 - 3',
	'Medellin',
	'Antioquia',
	'contacto@ejemplo.edu.co',
	'(57) (604) 000 00 00',
	1
WHERE NOT EXISTS (
	SELECT 1 FROM tbld_instituciones WHERE nombre = 'Institucion de ejemplo'
);

-- ================================================================
-- Nota importante
-- No se incluyen usuarios reales ni contraseñas reales.
-- Crea tus cuentas de aplicación con un proceso seguro de registro.
-- ================================================================

SELECT 'Base de datos Rural 4.0 inicializada correctamente.' AS estado;
