-- =====================================================================
-- Turnoo · Migración 016 · Planes
-- Se aplica con el superusuario (npm run db:migrar), después de la 015.
--
-- Carga los tres planes que ofrece Turnoo. Precio en pesos colombianos al mes.
-- En los límites, NULL significa sin límite (ver COMMENT ON TABLE planes): las
-- citas del mes no se limitan en ningún plan.
--
-- El superadmin asigna el plan a cada negocio (PATCH /negocios/:id, planId).
-- Para cambiar un precio o un límite más adelante, otra migración con UPDATE:
-- esta no se edita.
-- =====================================================================

BEGIN;

INSERT INTO planes (nombre, precio_mensual_cop, max_profesionales, max_conversaciones_ia_mes, max_citas_mes) VALUES
  ('Independiente', 39900,  1,  300, NULL),
  ('Barbería',      89900,  4, 1000, NULL),
  ('Pro',          149900, 10, 2500, NULL);

COMMIT;
