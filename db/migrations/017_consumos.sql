-- =====================================================================
-- Turnoo · Migración 017 · Registro de consumo
-- Se aplica con el superusuario (npm run db:migrar), después de la 016.
--
-- uso_mensual guarda un total por negocio y mes: sirve para los límites del
-- plan, pero no dice qué día se gastó, con qué modelo ni qué categoría de
-- plantilla. Esta tabla guarda una fila por cada gasto, para el panel del
-- superadmin:
--
--  * ia_texto:  una atención de la IA (todas sus llamadas al modelo sumadas).
--  * audio:     una nota de voz transcrita.
--  * plantilla: una plantilla de WhatsApp que Meta aceptó.
--
-- Se escribe en la misma transacción que suma en uso_mensual, así los dos
-- registros no se separan. Solo cantidades: nunca el texto de un mensaje, un
-- teléfono ni el id de una conversación.
--
-- Empieza vacía: de los meses anteriores a esta migración solo existe el total
-- de uso_mensual, sin detalle por día.
-- =====================================================================

BEGIN;

CREATE TABLE consumos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id           uuid NOT NULL REFERENCES negocios (id) ON DELETE CASCADE,
  creado_en            timestamptz NOT NULL DEFAULT now(),
  tipo                 text NOT NULL CHECK (tipo IN ('ia_texto', 'audio', 'plantilla')),
  tokens_entrada       integer CHECK (tokens_entrada >= 0),
  tokens_salida        integer CHECK (tokens_salida >= 0),
  segundos_audio       integer CHECK (segundos_audio > 0),
  categoria_plantilla  text CHECK (categoria_plantilla IN ('utilidad', 'marketing', 'autenticacion')),
  modelo               text,
  UNIQUE (negocio_id, id),
  -- Cada tipo lleva sus columnas y solo esas.
  CONSTRAINT consumos_columnas_del_tipo CHECK (
    CASE tipo
      WHEN 'ia_texto' THEN tokens_entrada IS NOT NULL AND tokens_salida IS NOT NULL AND modelo IS NOT NULL
                           AND segundos_audio IS NULL AND categoria_plantilla IS NULL
      WHEN 'audio' THEN segundos_audio IS NOT NULL AND modelo IS NOT NULL
                        AND tokens_entrada IS NULL AND tokens_salida IS NULL AND categoria_plantilla IS NULL
      WHEN 'plantilla' THEN categoria_plantilla IS NOT NULL
                            AND tokens_entrada IS NULL AND tokens_salida IS NULL
                            AND segundos_audio IS NULL AND modelo IS NULL
    END
  )
);
CREATE INDEX consumos_negocio_fecha_idx ON consumos (negocio_id, creado_en);

ALTER TABLE consumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumos FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_negocio ON consumos
  USING (negocio_id = app_negocio_id() OR app_es_sistema())
  WITH CHECK (negocio_id = app_negocio_id() OR app_es_sistema());

COMMENT ON TABLE consumos IS
  'Una fila por gasto (atención de IA, audio transcrito o plantilla enviada). Solo cantidades, sin datos de clientes. El total del mes sigue en uso_mensual.';

COMMIT;
