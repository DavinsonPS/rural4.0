-- SOLO PARA LA BASE LOCAL DE DOCKER. Nunca importar en Plesk.
-- Pone la misma contraseña a todas las cuentas del volcado para poder entrar con
-- cualquier rol en pruebas:   contraseña = Rural40-local
UPDATE tblh_usuarios
SET password_hash = '$2b$12$6PXLnG2SXomoUC52czDfteOGQD0cBrxmqLs7wzdQ1wos5bAgCG.yC';

-- Administrador de pruebas: usuario admin.local / Rural40-local
INSERT IGNORE INTO tblh_usuarios
  (id_tipo_documento, numero_documento, nombres, apellidos, correo, id_rol, id_institucion, usuario, password_hash)
SELECT td.id, '999000001', 'Admin', 'Local', 'admin.local@rural40.test', r.id, 1, 'admin.local',
  '$2b$12$6PXLnG2SXomoUC52czDfteOGQD0cBrxmqLs7wzdQ1wos5bAgCG.yC'
FROM tbld_tipos_documentos td JOIN tbld_roles r ON r.nombre = 'ADMINISTRADOR'
WHERE td.codigo = 'CC';
