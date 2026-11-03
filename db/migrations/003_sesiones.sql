-- =====================================================================
-- Turnoo · Migración 003 · Sesiones del panel y aislamiento de tokens
-- Se aplica con el superusuario (turnoo_admin), después de la 002.
--
--  * sesiones: una fila por inicio de sesión. Solo se guarda el HASH del token.
--    negocio_id NULL = sesión del superadmin (solo visible con conSistema).
--  * tokens_usuario (invitaciones y recuperaciones) pasa a tener RLS: cada
--    negocio solo ve los tokens de SUS usuarios.
-- =====================================================================

BEGIN;

CREATE TABLE sesiones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id   uuid REFERENCES negocios (id) ON DELETE CASCADE,
  usuario_id   uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  expira_en    timestamptz NOT NULL,
  revocada_en  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (negocio_id, usuario_id) REFERENCES usuarios (negocio_id, id) ON DELETE CASCADE
);
CREATE INDEX sesiones_usuario_idx ON sesiones (usuario_id);

ALTER TABLE sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesiones FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_negocio ON sesiones
  USING (negocio_id = app_negocio_id() OR app_es_sistema())
  WITH CHECK (negocio_id = app_negocio_id() OR app_es_sistema());

-- Un token solo es visible si su usuario lo es (usuarios ya tiene RLS por negocio).
ALTER TABLE tokens_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokens_usuario FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_usuario ON tokens_usuario
  USING (app_es_sistema()
         OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = tokens_usuario.usuario_id))
  WITH CHECK (app_es_sistema()
         OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = tokens_usuario.usuario_id));

COMMIT;
