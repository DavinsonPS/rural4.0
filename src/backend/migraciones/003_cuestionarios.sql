-- =============================================================================
-- Rural 4.0 · Migración 003 · Cuestionarios por tema
-- Importar manualmente en Plesk (phpMyAdmin) DESPUÉS de 001_base.sql.
-- En phpMyAdmin, 'Conjunto de caracteres del archivo' debe ser utf-8 (valor por defecto).
-- ANTES: exporta un respaldo completo de la base. Es idempotente.
--
-- Crea:
--   tbld_temas                   Temas (riego, luz, suelo, plagas, crecimiento, datos)
--   tblh_preguntas               Banco: preguntas del sistema (id_docente NULL) y de cada docente
--   tblh_opciones_pregunta       Opciones de cada pregunta (una correcta)
--   tblh_cuestionarios           Cuestionarios creados por un docente
--   tblh_cuestionario_preguntas  Preguntas incluidas en cada cuestionario
--   tblh_intentos                Un intento por estudiante y cuestionario, con su puntaje
--   tblh_respuestas              Opción elegida en cada pregunta del intento
-- y carga el banco inicial de 30 preguntas (5 por tema).
-- Un cuestionario se asigna a todos los estudiantes que tienen al docente en un
-- proyecto activo; no hay tabla de asignación.
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `tbld_temas` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `codigo` varchar(30) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `orden` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tbld_temas_codigo` (`codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tblh_preguntas` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `codigo` varchar(40) DEFAULT NULL COMMENT 'Solo preguntas del banco del sistema',
  `id_tema` int(10) UNSIGNED NOT NULL,
  `id_docente` int(10) UNSIGNED DEFAULT NULL COMMENT 'NULL = banco del sistema',
  `tipo` varchar(20) NOT NULL COMMENT 'opcion_multiple | verdadero_falso',
  `enunciado` varchar(500) NOT NULL,
  `explicacion` varchar(500) DEFAULT NULL,
  `fecha_registro` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_update` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tblh_preguntas_codigo` (`codigo`),
  KEY `idx_tblh_preguntas_tema` (`id_tema`, `estado`),
  KEY `idx_tblh_preguntas_docente` (`id_docente`, `estado`),
  CONSTRAINT `fk_tblh_preguntas_tema` FOREIGN KEY (`id_tema`) REFERENCES `tbld_temas` (`id`),
  CONSTRAINT `fk_tblh_preguntas_docente` FOREIGN KEY (`id_docente`) REFERENCES `tblh_usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tblh_opciones_pregunta` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_pregunta` int(10) UNSIGNED NOT NULL,
  `orden` tinyint(3) UNSIGNED NOT NULL,
  `texto` varchar(255) NOT NULL,
  `es_correcta` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tblh_opciones_pregunta_orden` (`id_pregunta`, `orden`),
  CONSTRAINT `fk_tblh_opciones_pregunta` FOREIGN KEY (`id_pregunta`) REFERENCES `tblh_preguntas` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tblh_cuestionarios` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_docente` int(10) UNSIGNED NOT NULL,
  `id_tema` int(10) UNSIGNED NOT NULL,
  `titulo` varchar(150) NOT NULL,
  `descripcion` varchar(500) DEFAULT NULL,
  `fecha_apertura` datetime NOT NULL,
  `fecha_cierre` datetime NOT NULL,
  `publicado` tinyint(1) NOT NULL DEFAULT 0,
  `fecha_registro` datetime NOT NULL DEFAULT current_timestamp(),
  `fecha_update` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_tblh_cuestionarios_docente` (`id_docente`, `estado`, `fecha_cierre`),
  CONSTRAINT `fk_tblh_cuestionarios_docente` FOREIGN KEY (`id_docente`) REFERENCES `tblh_usuarios` (`id`),
  CONSTRAINT `fk_tblh_cuestionarios_tema` FOREIGN KEY (`id_tema`) REFERENCES `tbld_temas` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tblh_cuestionario_preguntas` (
  `id_cuestionario` int(10) UNSIGNED NOT NULL,
  `id_pregunta` int(10) UNSIGNED NOT NULL,
  `orden` smallint(5) UNSIGNED NOT NULL,
  PRIMARY KEY (`id_cuestionario`, `id_pregunta`),
  KEY `idx_tblh_cuestionario_preguntas_pregunta` (`id_pregunta`),
  CONSTRAINT `fk_tblh_cp_cuestionario` FOREIGN KEY (`id_cuestionario`) REFERENCES `tblh_cuestionarios` (`id`),
  CONSTRAINT `fk_tblh_cp_pregunta` FOREIGN KEY (`id_pregunta`) REFERENCES `tblh_preguntas` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tblh_intentos` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_cuestionario` int(10) UNSIGNED NOT NULL,
  `id_estudiante` int(10) UNSIGNED NOT NULL,
  `correctas` smallint(5) UNSIGNED NOT NULL,
  `total` smallint(5) UNSIGNED NOT NULL,
  `fecha_envio` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tblh_intentos_estudiante` (`id_cuestionario`, `id_estudiante`),
  KEY `idx_tblh_intentos_estudiante` (`id_estudiante`),
  CONSTRAINT `fk_tblh_intentos_cuestionario` FOREIGN KEY (`id_cuestionario`) REFERENCES `tblh_cuestionarios` (`id`),
  CONSTRAINT `fk_tblh_intentos_estudiante` FOREIGN KEY (`id_estudiante`) REFERENCES `tblh_usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tblh_respuestas` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_intento` int(10) UNSIGNED NOT NULL,
  `id_pregunta` int(10) UNSIGNED NOT NULL,
  `id_opcion` int(10) UNSIGNED NOT NULL,
  `es_correcta` tinyint(1) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tblh_respuestas_pregunta` (`id_intento`, `id_pregunta`),
  KEY `idx_tblh_respuestas_pregunta` (`id_pregunta`),
  CONSTRAINT `fk_tblh_respuestas_intento` FOREIGN KEY (`id_intento`) REFERENCES `tblh_intentos` (`id`),
  CONSTRAINT `fk_tblh_respuestas_pregunta` FOREIGN KEY (`id_pregunta`) REFERENCES `tblh_preguntas` (`id`),
  CONSTRAINT `fk_tblh_respuestas_opcion` FOREIGN KEY (`id_opcion`) REFERENCES `tblh_opciones_pregunta` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- -----------------------------------------------------------------------------
-- Temas
-- -----------------------------------------------------------------------------

INSERT IGNORE INTO `tbld_temas` (`codigo`, `nombre`, `descripcion`, `orden`) VALUES ('riego', 'Riego y humedad', 'Cuándo y cuánto regar; cómo leer la humedad del suelo.', 1);
INSERT IGNORE INTO `tbld_temas` (`codigo`, `nombre`, `descripcion`, `orden`) VALUES ('luz', 'Luz y color de las hojas', 'Fotosíntesis, pigmentos y el efecto de la luz en la planta.', 2);
INSERT IGNORE INTO `tbld_temas` (`codigo`, `nombre`, `descripcion`, `orden`) VALUES ('suelo', 'Suelo y compost', 'Tipos de tierra, abono orgánico y vida en el suelo.', 3);
INSERT IGNORE INTO `tbld_temas` (`codigo`, `nombre`, `descripcion`, `orden`) VALUES ('plagas', 'Plagas y salud de la planta', 'Cómo detectar y controlar visitantes en la huerta.', 4);
INSERT IGNORE INTO `tbld_temas` (`codigo`, `nombre`, `descripcion`, `orden`) VALUES ('crecimiento', 'Crecimiento y desarrollo', 'Germinación, etapas de la planta y cómo medir su avance.', 5);
INSERT IGNORE INTO `tbld_temas` (`codigo`, `nombre`, `descripcion`, `orden`) VALUES ('datos', 'Datos y sensores', 'Leer las gráficas del proyecto y relacionarlas con lo observado.', 6);

-- -----------------------------------------------------------------------------
-- Banco inicial de preguntas (sistema)
-- -----------------------------------------------------------------------------

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'riego-01', t.id, 'opcion_multiple', '¿Cuál es la mejor forma de saber si tu planta necesita agua?', 'La humedad se comprueba tocando la tierra a unos centímetros de profundidad o mirando el sensor, no por la hora o el clima.' FROM `tbld_temas` t WHERE t.codigo = 'riego';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Tocar la tierra a 2 o 3 cm de profundidad', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'riego-01';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Mirar si el cielo está nublado', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'riego-01';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'Regar todos los días a la misma hora sin revisar', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'riego-01';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'Ver si las hojas brillan', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'riego-01';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'riego-02', t.id, 'verdadero_falso', 'Regar en exceso puede dañar las raíces porque el agua encharcada les quita el aire que necesitan.', 'Las raíces también respiran. Cuando la tierra está encharcada, el agua ocupa el espacio del aire y las raíces pueden pudrirse.' FROM `tbld_temas` t WHERE t.codigo = 'riego';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Verdadero', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'riego-02';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Falso', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'riego-02';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'riego-03', t.id, 'opcion_multiple', 'Si el sensor marca 20 % de humedad del suelo, ¿qué significa?', 'Un porcentaje bajo de humedad indica tierra seca. En general, por debajo de 30 % la planta probablemente necesita agua.' FROM `tbld_temas` t WHERE t.codigo = 'riego';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'La tierra está seca y probablemente necesita agua', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'riego-03';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'La tierra tiene demasiada agua', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'riego-03';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'La planta tiene frío', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'riego-03';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'El sensor está midiendo la luz', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'riego-03';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'riego-04', t.id, 'opcion_multiple', '¿En qué momento del día conviene regar?', 'Con menos calor se evapora menos agua y la planta la aprovecha mejor.' FROM `tbld_temas` t WHERE t.codigo = 'riego';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Temprano en la mañana o al final de la tarde', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'riego-04';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Al mediodía, con el sol más fuerte', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'riego-04';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'Solo a medianoche', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'riego-04';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'Da igual, el agua se aprovecha siempre igual', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'riego-04';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'riego-05', t.id, 'verdadero_falso', 'Todas las plantas necesitan exactamente la misma cantidad de agua.', 'Cada cultivo, su tamaño, el tipo de tierra y el clima cambian cuánta agua necesita la planta.' FROM `tbld_temas` t WHERE t.codigo = 'riego';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Verdadero', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'riego-05';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Falso', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'riego-05';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'luz-01', t.id, 'opcion_multiple', '¿Para qué usa la planta la luz?', 'Con la luz, el agua y el dióxido de carbono la planta fabrica su alimento: eso es la fotosíntesis.' FROM `tbld_temas` t WHERE t.codigo = 'luz';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Para fabricar su alimento mediante la fotosíntesis', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'luz-01';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Para calentarse y dormir', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'luz-01';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'Para absorber agua por las hojas', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'luz-01';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'No la usa para nada', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'luz-01';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'luz-02', t.id, 'verdadero_falso', 'Una planta que recibe muy poca luz puede crecer alta, delgada y con hojas pálidas.', 'Sin suficiente luz la planta se estira buscándola y produce menos clorofila, por eso se ve débil y pálida.' FROM `tbld_temas` t WHERE t.codigo = 'luz';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Verdadero', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'luz-02';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Falso', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'luz-02';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'luz-03', t.id, 'opcion_multiple', '¿Cómo se llaman los pigmentos que dan el color morado a la lechuga morada o a la col morada?', 'Las antocianinas son pigmentos rojos, morados o azules; la luz y la temperatura influyen en cuánto produce la planta.' FROM `tbld_temas` t WHERE t.codigo = 'luz';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Antocianinas', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'luz-03';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Proteínas', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'luz-03';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'Vitaminas', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'luz-03';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'Minerales', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'luz-03';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'luz-04', t.id, 'opcion_multiple', '¿Qué pigmento da el color verde a las hojas?', 'La clorofila es verde y es la que capta la luz para la fotosíntesis.' FROM `tbld_temas` t WHERE t.codigo = 'luz';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Clorofila', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'luz-04';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Antocianina', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'luz-04';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'Melanina', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'luz-04';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'Sal', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'luz-04';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'luz-05', t.id, 'opcion_multiple', 'El sensor de luz marca 0 lx en plena tarde. ¿Qué es lo más probable?', 'De día casi siempre hay algo de luz. Un 0 constante suele indicar que el sensor está tapado, desconectado o la planta está en un lugar muy oscuro.' FROM `tbld_temas` t WHERE t.codigo = 'luz';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'El sensor está tapado, desconectado o la planta está en un lugar muy oscuro', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'luz-05';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'La planta está creciendo muy rápido', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'luz-05';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'El suelo está seco', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'luz-05';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'Hace mucho calor', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'luz-05';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'suelo-01', t.id, 'opcion_multiple', '¿Qué es el compost?', 'El compost es abono natural que se obtiene cuando restos orgánicos se descomponen con ayuda de microorganismos y lombrices.' FROM `tbld_temas` t WHERE t.codigo = 'suelo';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Abono hecho con restos orgánicos descompuestos', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'suelo-01';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Un tipo de plástico', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'suelo-01';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'Arena de río', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'suelo-01';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'Un insecticida químico', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'suelo-01';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'suelo-02', t.id, 'opcion_multiple', '¿Qué tipo de tierra retiene más agua?', 'La arcilla tiene partículas muy finas que guardan mucha agua; la arena deja pasar el agua rápido.' FROM `tbld_temas` t WHERE t.codigo = 'suelo';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Tierra arcillosa', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'suelo-02';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Tierra arenosa', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'suelo-02';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'Piedras', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'suelo-02';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'Todas retienen igual', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'suelo-02';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'suelo-03', t.id, 'verdadero_falso', 'Encontrar lombrices en el compost es una buena señal.', 'Las lombrices ayudan a descomponer los restos y a airear el suelo: indican un compost sano.' FROM `tbld_temas` t WHERE t.codigo = 'suelo';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Verdadero', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'suelo-03';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Falso', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'suelo-03';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'suelo-04', t.id, 'opcion_multiple', '¿Cuál de estos residuos NO debe ir al compost casero?', 'La carne, los huesos y las grasas se pudren con mal olor y atraen animales; los restos vegetales sí sirven.' FROM `tbld_temas` t WHERE t.codigo = 'suelo';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Carne, huesos y grasas', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'suelo-04';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Cáscaras de frutas', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'suelo-04';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'Hojas secas', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'suelo-04';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'Restos de verduras', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'suelo-04';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'suelo-05', t.id, 'verdadero_falso', 'La tierra arenosa deja pasar el agua más rápido que la tierra arcillosa.', 'Entre los granos de arena quedan espacios grandes por donde el agua se escurre con facilidad.' FROM `tbld_temas` t WHERE t.codigo = 'suelo';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Verdadero', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'suelo-05';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Falso', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'suelo-05';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'plagas-01', t.id, 'opcion_multiple', '¿Dónde conviene buscar insectos en una planta?', 'Muchos insectos se esconden en el reverso de las hojas, donde están protegidos del sol y de la lluvia.' FROM `tbld_temas` t WHERE t.codigo = 'plagas';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'En el reverso (la parte de abajo) de las hojas', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'plagas-01';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Solo en la maceta', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'plagas-01';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'Solo en las raíces, arrancando la planta', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'plagas-01';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'En ningún lado, no hace falta revisar', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'plagas-01';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'plagas-02', t.id, 'opcion_multiple', 'Si las hojas tienen pequeños agujeros, ¿qué suele indicar?', 'Los agujeros en las hojas suelen ser mordidas de insectos u orugas.' FROM `tbld_temas` t WHERE t.codigo = 'plagas';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Que algún insecto se las está comiendo', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'plagas-02';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Que recibe demasiada luz', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'plagas-02';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'Que la planta creció mucho', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'plagas-02';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'Que el sensor está fallando', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'plagas-02';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'plagas-03', t.id, 'verdadero_falso', 'Las mariquitas ayudan a controlar plagas como los pulgones.', 'Las mariquitas se alimentan de pulgones: son aliadas de la huerta.' FROM `tbld_temas` t WHERE t.codigo = 'plagas';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Verdadero', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'plagas-03';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Falso', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'plagas-03';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'plagas-04', t.id, 'opcion_multiple', '¿Cuál es una forma segura de controlar unos pocos insectos en la huerta escolar?', 'Con pocas plagas, retirarlas a mano y revisar con frecuencia evita usar químicos y es seguro para los estudiantes.' FROM `tbld_temas` t WHERE t.codigo = 'plagas';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Retirarlos a mano y revisar la planta con frecuencia', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'plagas-04';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Echar cualquier químico sin supervisión', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'plagas-04';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'Arrancar la planta', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'plagas-04';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'Regar con agua con sal', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'plagas-04';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'plagas-05', t.id, 'verdadero_falso', 'Las manchas amarillas en las hojas siempre significan que hay una plaga.', 'Las hojas amarillas también pueden deberse a exceso o falta de agua, falta de nutrientes o poca luz.' FROM `tbld_temas` t WHERE t.codigo = 'plagas';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Verdadero', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'plagas-05';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Falso', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'plagas-05';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'crecimiento-01', t.id, 'opcion_multiple', '¿Desde dónde se mide la altura de una planta?', 'Se mide desde la superficie de la tierra hasta el punto más alto de la planta, siempre de la misma forma para poder comparar.' FROM `tbld_temas` t WHERE t.codigo = 'crecimiento';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Desde la superficie de la tierra hasta el punto más alto', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'crecimiento-01';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Desde el fondo de la maceta', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'crecimiento-01';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'Desde la punta de la raíz', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'crecimiento-01';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'Solo se mide la hoja más grande', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'crecimiento-01';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'crecimiento-02', t.id, 'opcion_multiple', '¿Qué necesita una semilla para germinar?', 'La semilla necesita agua, aire y una temperatura adecuada; muchas germinan incluso bajo la tierra, sin luz.' FROM `tbld_temas` t WHERE t.codigo = 'crecimiento';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Agua, aire y una temperatura adecuada', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'crecimiento-02';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Solo luz muy fuerte', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'crecimiento-02';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'Sal', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'crecimiento-02';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'Nada, germina sola en cualquier lugar', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'crecimiento-02';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'crecimiento-03', t.id, 'verdadero_falso', 'Medir la altura con regularidad ayuda a saber si la planta crece más rápido o más lento con el tiempo.', 'Con varias mediciones se puede comparar el ritmo de crecimiento y relacionarlo con el riego, la luz o la tierra.' FROM `tbld_temas` t WHERE t.codigo = 'crecimiento';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Verdadero', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'crecimiento-03';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Falso', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'crecimiento-03';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'crecimiento-04', t.id, 'opcion_multiple', 'En el fríjol, ¿cómo se llaman las primeras hojas carnosas que salen de la semilla?', 'Los cotiledones guardan alimento para la plántula mientras desarrolla sus primeras hojas verdaderas.' FROM `tbld_temas` t WHERE t.codigo = 'crecimiento';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Cotiledones', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'crecimiento-04';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Raíces', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'crecimiento-04';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'Flores', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'crecimiento-04';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'Frutos', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'crecimiento-04';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'crecimiento-05', t.id, 'opcion_multiple', 'Tu planta medía 3 cm el lunes y 5 cm el viernes. ¿Cuánto creció?', 'Se resta la medida inicial de la final: 5 cm − 3 cm = 2 cm.' FROM `tbld_temas` t WHERE t.codigo = 'crecimiento';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, '2 cm', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'crecimiento-05';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, '8 cm', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'crecimiento-05';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, '5 cm', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'crecimiento-05';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, '3 cm', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'crecimiento-05';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'datos-01', t.id, 'opcion_multiple', '¿Cada cuánto guarda una lectura el sensor de tu proyecto?', 'El ESP32 de sensores envía una medición cada 5 minutos; por eso la gráfica tiene tantos puntos.' FROM `tbld_temas` t WHERE t.codigo = 'datos';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Cada 5 minutos', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'datos-01';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Una vez al mes', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'datos-01';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'Solo cuando llueve', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'datos-01';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'Nunca guarda lecturas', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'datos-01';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'datos-02', t.id, 'opcion_multiple', 'Si la temperatura sube durante el día y baja en la noche, ¿cómo se verá la gráfica?', 'Los cambios del día y la noche aparecen como una línea que sube y baja de forma repetida.' FROM `tbld_temas` t WHERE t.codigo = 'datos';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Una línea que sube y baja', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'datos-02';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Una línea completamente recta', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'datos-02';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'Una gráfica vacía', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'datos-02';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'Solo un punto', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'datos-02';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'datos-03', t.id, 'verdadero_falso', 'Si el sensor de temperatura marca 0 °C en un día caluroso, lo más probable es que esté desconectado.', 'El firmware envía 0 cuando un sensor no está conectado. Un valor imposible para el clima del día es una pista de falla.' FROM `tbld_temas` t WHERE t.codigo = 'datos';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Verdadero', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'datos-03';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Falso', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'datos-03';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'datos-04', t.id, 'opcion_multiple', '¿En qué unidad se expresa la humedad del suelo en tu proyecto?', 'La humedad del suelo se muestra en porcentaje: 0 % es muy seco y 100 % es muy húmedo.' FROM `tbld_temas` t WHERE t.codigo = 'datos';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Porcentaje (%)', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'datos-04';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Grados (°C)', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'datos-04';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'Lux (lx)', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'datos-04';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'Centímetros (cm)', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'datos-04';

INSERT IGNORE INTO `tblh_preguntas` (`codigo`, `id_tema`, `tipo`, `enunciado`, `explicacion`)
SELECT 'datos-05', t.id, 'opcion_multiple', '¿Para qué sirve comparar tus observaciones con los datos del sensor?', 'Comparar lo observado con lo medido permite comprobar ideas y sacar conclusiones, como hacen los científicos.' FROM `tbld_temas` t WHERE t.codigo = 'datos';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 1, 'Para comprobar si lo que observas coincide con lo que se mide y sacar conclusiones', 1 FROM `tblh_preguntas` p WHERE p.codigo = 'datos-05';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 2, 'Para no tener que observar la planta', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'datos-05';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 3, 'Para borrar datos', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'datos-05';
INSERT IGNORE INTO `tblh_opciones_pregunta` (`id_pregunta`, `orden`, `texto`, `es_correcta`) SELECT p.id, 4, 'No sirve para nada', 0 FROM `tblh_preguntas` p WHERE p.codigo = 'datos-05';

INSERT IGNORE INTO `tbl_migraciones` (`id`, `descripcion`)
VALUES ('003_cuestionarios', 'Cuestionarios por tema con banco inicial de preguntas');

-- Verificación: 6 temas y 30 preguntas del sistema
SELECT COUNT(*) AS temas FROM `tbld_temas`;
SELECT COUNT(*) AS preguntas_sistema FROM `tblh_preguntas` WHERE `id_docente` IS NULL;
