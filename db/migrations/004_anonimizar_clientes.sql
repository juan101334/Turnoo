-- =====================================================================
-- Turnoo · Migración 004 · Anonimización real de clientes
-- Se aplica con el superusuario (turnoo_admin), después de la 003.
--
--  * clientes.telefono admite NULL, solo para un cliente anonimizado. Así no se
--    inventa un número falso, que una tarea podría usar para enviar un mensaje.
--  * Una restricción garantiza que un cliente anonimizado no conserve datos
--    personales y que uno vigente siempre tenga teléfono.
--  * UNIQUE (negocio_id, telefono) permite varios NULL: varios anonimizados conviven,
--    y si la persona vuelve a escribir, se crea un cliente nuevo.
-- =====================================================================

BEGIN;

ALTER TABLE clientes ALTER COLUMN telefono DROP NOT NULL;

ALTER TABLE clientes ADD CONSTRAINT clientes_anonimizado_sin_datos CHECK (
  CASE
    WHEN anonimizado_en IS NULL THEN telefono IS NOT NULL
    ELSE telefono IS NULL AND nombre IS NULL AND notas IS NULL
  END
);

COMMENT ON COLUMN clientes.anonimizado_en IS
  'Si el cliente pide borrar sus datos se anonimiza la fila (nombre, teléfono y notas quedan en NULL) en vez de borrarla, para conservar el historial de citas. También se borran sus conversaciones y las notas de sus citas.';

COMMIT;
