-- =====================================================================
-- Turnoo · Migración 013 · Avisos al dueño por plantilla de WhatsApp
-- Se aplica con el superusuario (turnoo_admin), después de la 012.
--
-- Cuando la IA deriva una conversación, el dueño recibe una plantilla en
-- negocios.telefono_avisos. También al llegar al 80% del límite de
-- conversaciones de IA del plan. Lo envía una tarea interna, fuera de la
-- atención, con reserva por tiempo (igual que el procesador de conversaciones).
--
--  * derivaciones.aviso_resultado: NULL = pendiente; 'enviado', 'vencido' (más
--    de 24 h sin poder avisar, por ejemplo sin teléfono de avisos) o 'fallido'.
--  * derivaciones.aviso_intentos / aviso_reservado_hasta: reintentos y reserva.
--  * uso_mensual.aviso_limite_en: cuándo se avisó el 80% de ese mes (uno por mes).
-- =====================================================================

BEGIN;

ALTER TABLE derivaciones
  ADD COLUMN aviso_resultado       text CHECK (aviso_resultado IN ('enviado', 'vencido', 'fallido')),
  ADD COLUMN aviso_intentos        integer NOT NULL DEFAULT 0 CHECK (aviso_intentos >= 0),
  ADD COLUMN aviso_reservado_hasta timestamptz;

-- Las derivaciones anteriores a esta migración ya pasaron: no se avisan ahora.
UPDATE derivaciones SET aviso_resultado = 'vencido' WHERE avisada_en IS NULL;
UPDATE derivaciones SET aviso_resultado = 'enviado' WHERE avisada_en IS NOT NULL;

ALTER TABLE derivaciones ADD CONSTRAINT derivaciones_aviso_enviado_con_fecha
  CHECK ((aviso_resultado = 'enviado') = (avisada_en IS NOT NULL));

CREATE INDEX derivaciones_aviso_pendiente_idx ON derivaciones (created_at)
  WHERE aviso_resultado IS NULL;

ALTER TABLE uso_mensual ADD COLUMN aviso_limite_en timestamptz;

COMMENT ON COLUMN derivaciones.aviso_resultado IS
  'Aviso al dueño: NULL pendiente, enviado, vencido (24 h sin poder avisar) o fallido.';
COMMENT ON COLUMN uso_mensual.aviso_limite_en IS
  'Cuándo se avisó al dueño que el negocio llegó al 80% de las conversaciones de IA de su plan.';

COMMIT;
