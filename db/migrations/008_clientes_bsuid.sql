-- =====================================================================
-- Turnoo · Migración 008 · Clientes identificados por su BSUID de WhatsApp
-- Se aplica con el superusuario (turnoo_admin), después de la 007.
--
-- Desde abril de 2026 Meta envía en cada mensaje el "business-scoped user ID"
-- (BSUID) de la persona. Si la persona activa su nombre de usuario de WhatsApp,
-- el teléfono puede no llegar. Por eso:
--
--  * clientes.wa_user_id guarda el BSUID, único por negocio. Se guarda siempre
--    que llega, también si hay teléfono, para reconocer al mismo cliente cuando
--    un mensaje posterior llegue sin teléfono.
--  * Un cliente vigente necesita teléfono o BSUID (antes, solo teléfono).
--  * Un cliente anonimizado no conserva ninguno de los dos.
--  * UNIQUE (negocio_id, wa_user_id) permite varios NULL, igual que el teléfono.
-- =====================================================================

BEGIN;

ALTER TABLE clientes ADD COLUMN wa_user_id text
  CHECK (wa_user_id ~ '^[A-Z]{2}\.[A-Za-z0-9]{1,128}$');

ALTER TABLE clientes ADD CONSTRAINT clientes_negocio_wa_user_id_key UNIQUE (negocio_id, wa_user_id);

ALTER TABLE clientes DROP CONSTRAINT clientes_anonimizado_sin_datos;
ALTER TABLE clientes ADD CONSTRAINT clientes_anonimizado_sin_datos CHECK (
  CASE
    WHEN anonimizado_en IS NULL THEN telefono IS NOT NULL OR wa_user_id IS NOT NULL
    ELSE telefono IS NULL AND wa_user_id IS NULL AND nombre IS NULL AND notas IS NULL
  END
);

COMMENT ON COLUMN clientes.wa_user_id IS
  'BSUID de WhatsApp (ej. CO.13491208655302741918): identifica a la persona aunque no llegue su teléfono. Meta lo cambia si la persona cambia de número.';
COMMENT ON COLUMN clientes.telefono IS
  'Solo dígitos con indicativo (formato wa_id de WhatsApp). Puede faltar si el cliente solo se conoce por su BSUID.';

COMMIT;
