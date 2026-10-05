-- =============================================================================
-- Rural 4.0 · Migración 001 · Base
-- Importar manualmente en Plesk (phpMyAdmin → base rural40_db → Importar).
-- ANTES: exporta un respaldo completo de la base.
-- Es idempotente: se puede ejecutar más de una vez sin efectos adicionales.
--
-- Qué hace:
--   1. Crea tbl_migraciones para saber qué scripts ya se importaron.
--   2. Convierte la base y todas las tablas a utf8mb4 (hoy están en utf8mb3 y
--      rechazan emojis: un estudiante que escriba 🌱 desde el celular recibe error).
--   3. Crea el índice que usa el historial de lecturas (ordena por fecha_registro).
--   4. Elimina un índice duplicado en tblh_bitacoras_diarias (el UNIQUE ya lo cubre).
--
-- No borra ni modifica datos.
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `tbl_migraciones` (
  `id` varchar(100) NOT NULL,
  `descripcion` varchar(255) NOT NULL,
  `fecha_aplicacion` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

ALTER TABLE `tbld_dispositivos` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE `tbld_instituciones` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE `tbld_plantas` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE `tbld_roles` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE `tbld_tipos_documentos` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE `tblh_bitacoras_diarias` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE `tblh_fotografias_monitoreo` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE `tblh_proyectos` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE `tblh_recuperacion_claves` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE `tblh_registros_monitoreo` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE `tblh_registros_pendientes` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE `tblh_usuarios` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE `tblh_versiones_firmware` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

CREATE INDEX IF NOT EXISTS `idx_tblh_monitoreo_proyecto_registro`
  ON `tblh_registros_monitoreo` (`id_proyecto`, `estado`, `fecha_registro`);

ALTER TABLE `tblh_bitacoras_diarias` DROP INDEX IF EXISTS `idx_tblh_bitacoras_proyecto_fecha`;

INSERT IGNORE INTO `tbl_migraciones` (`id`, `descripcion`)
VALUES ('001_base', 'utf8mb4, índice de historial de lecturas, índice duplicado de bitácoras');

-- Verificación: debe aparecer 001_base
SELECT * FROM `tbl_migraciones`;
