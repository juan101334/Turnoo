-- =====================================================================
-- Turnoo · Migración 011 · Funciones que usó la IA en cada conversación
-- Se aplica con el superusuario (turnoo_admin), después de la 010.
--
-- El historial de mensajes solo guarda textos. Sin esto, en el turno siguiente
-- la IA no sabe qué consultó antes (ni los ids de barbero y servicio): cuando el
-- cliente responde "sí", vuelve a consultar y vuelve a preguntar. Cada fila es
-- una función que pidió el modelo y lo que el backend le respondió; se le
-- devuelven en orden junto con los mensajes.
--
--  * call_id: el id que puso OpenAI a la llamada; une la llamada con su resultado.
--  * orden: varias funciones de una misma respuesta comparten creado_en.
--  * Se borra con la conversación (también al anonimizar al cliente).
-- =====================================================================

BEGIN;

CREATE TABLE ia_pasos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id       uuid NOT NULL REFERENCES negocios (id) ON DELETE CASCADE,
  conversacion_id  uuid NOT NULL,
  call_id          text NOT NULL,
  nombre           text NOT NULL,
  argumentos       text NOT NULL,
  resultado        text NOT NULL,
  orden            integer NOT NULL CHECK (orden >= 0),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (negocio_id, conversacion_id)
    REFERENCES conversaciones (negocio_id, id) ON DELETE CASCADE
);
CREATE INDEX ia_pasos_conversacion_idx ON ia_pasos (conversacion_id, creado_en, orden);

ALTER TABLE ia_pasos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_pasos FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_negocio ON ia_pasos
  USING (negocio_id = app_negocio_id() OR app_es_sistema())
  WITH CHECK (negocio_id = app_negocio_id() OR app_es_sistema());

COMMENT ON TABLE ia_pasos IS
  'Funciones que pidió la IA y sus resultados, para que recuerde lo que consultó en turnos anteriores.';

COMMIT;
