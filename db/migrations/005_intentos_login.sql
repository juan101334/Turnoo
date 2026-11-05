-- =====================================================================
-- Turnoo · Migración 005 · Límite de intentos de login
-- Se aplica con el superusuario (turnoo_admin), después de la 004.
--
--  * intentos_login: un contador por clave (cuenta, IP o ambas) y ventana de tiempo.
--    La clave es un SHA-256: aquí no queda ningún correo ni IP legible.
--  * El login ocurre antes de saber el negocio, así que la tabla no tiene negocio_id.
--    Con RLS, solo el contexto de sistema puede verla.
--  * Vive en la base y no en memoria para que reiniciar la API no borre los contadores.
-- =====================================================================

BEGIN;

CREATE TABLE intentos_login (
  clave           text PRIMARY KEY,
  intentos        integer NOT NULL CHECK (intentos >= 0),
  ventana_inicio  timestamptz NOT NULL
);
CREATE INDEX intentos_login_ventana_idx ON intentos_login (ventana_inicio);

ALTER TABLE intentos_login ENABLE ROW LEVEL SECURITY;
ALTER TABLE intentos_login FORCE ROW LEVEL SECURITY;
CREATE POLICY solo_sistema ON intentos_login
  USING (app_es_sistema())
  WITH CHECK (app_es_sistema());

COMMIT;
