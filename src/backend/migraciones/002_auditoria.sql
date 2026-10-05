-- =============================================================================
-- Rural 4.0 · Migración 002 · Auditoría de acciones de gestión
-- Importar manualmente en Plesk (phpMyAdmin) DESPUÉS de 001_base.sql.
-- ANTES: exporta un respaldo completo de la base. Es idempotente.
--
-- Registra quién finalizó, reabrió, reasignó, editó o archivó un proyecto, quién
-- vinculó o desvinculó dispositivos y quién ocultó fotos. La aplicación funciona
-- aunque esta tabla aún no exista: solo omite el registro y lo avisa en el log.
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `tblh_auditoria` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_usuario` int(10) UNSIGNED NOT NULL,
  `accion` varchar(60) NOT NULL,
  `entidad` varchar(40) NOT NULL,
  `id_entidad` bigint(20) UNSIGNED DEFAULT NULL,
  `detalle` text DEFAULT NULL,
  `fecha_registro` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_tblh_auditoria_entidad` (`entidad`, `id_entidad`, `fecha_registro`),
  KEY `idx_tblh_auditoria_usuario` (`id_usuario`, `fecha_registro`),
  CONSTRAINT `fk_tblh_auditoria_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `tblh_usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `tbl_migraciones` (`id`, `descripcion`)
VALUES ('002_auditoria', 'Tabla tblh_auditoria para acciones de gestión');

SELECT * FROM `tbl_migraciones`;
