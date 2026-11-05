-- =====================================================================
-- Turnoo · Migración 006 · Citas canceladas por el sistema
-- Se aplica con el superusuario (turnoo_admin), después de la 005.
--
--  * citas.cancelada_por admite 'sistema': una cita 'por_aprobar' cuyo plazo venció
--    no la canceló nadie. Así se distingue de un rechazo del barbero, y el aviso
--    futuro al cliente podrá encontrar estas citas.
-- =====================================================================

BEGIN;

ALTER TABLE citas DROP CONSTRAINT citas_cancelada_por_check;
ALTER TABLE citas ADD CONSTRAINT citas_cancelada_por_check
  CHECK (cancelada_por IN ('cliente', 'negocio', 'sistema'));

COMMIT;
