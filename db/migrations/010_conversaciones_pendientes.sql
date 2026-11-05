-- =====================================================================
-- Turnoo · Migración 010 · Conversaciones pendientes de respuesta
-- Se aplica con el superusuario (turnoo_admin), después de la 009.
--
-- El webhook guarda el mensaje y marca la conversación como pendiente. Un
-- procesador dentro de la API la toma después y la atiende (la IA). Sin cola
-- aparte: el estado vive en la conversación.
--
--  * ia_pendiente_desde / ia_pendiente_en: llegada del primer y del último
--    mensaje sin responder. Se responde 5 s después del último, para juntar los
--    mensajes seguidos, o a los 30 s del primero si el cliente no para.
--  * ia_procesando_hasta: reserva mientras se atiende. Vence sola si la API se
--    cae, y otra instancia la puede tomar.
--  * ia_intentos / ia_reintentar_en: fallos seguidos y cuándo reintentar.
-- =====================================================================

BEGIN;

ALTER TABLE conversaciones
  ADD COLUMN ia_pendiente_desde  timestamptz,
  ADD COLUMN ia_pendiente_en     timestamptz,
  ADD COLUMN ia_procesando_hasta timestamptz,
  ADD COLUMN ia_intentos         integer NOT NULL DEFAULT 0 CHECK (ia_intentos >= 0),
  ADD COLUMN ia_reintentar_en    timestamptz,
  ADD CONSTRAINT conversaciones_pendiente_completo
    CHECK ((ia_pendiente_desde IS NULL) = (ia_pendiente_en IS NULL)
           AND (ia_pendiente_desde IS NULL OR ia_pendiente_desde <= ia_pendiente_en));

-- El procesador consulta solo las pendientes, que son pocas.
CREATE INDEX conversaciones_pendientes_idx ON conversaciones (ia_pendiente_en)
  WHERE ia_pendiente_en IS NOT NULL;

COMMENT ON COLUMN conversaciones.ia_pendiente_en IS
  'Llegada del último mensaje del cliente sin responder. NULL = nada pendiente.';
COMMENT ON COLUMN conversaciones.ia_procesando_hasta IS
  'Reserva del procesador mientras atiende la conversación; vence sola si la API se cae.';

COMMIT;
