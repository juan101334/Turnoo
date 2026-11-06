-- =====================================================================
-- Turnoo · Migración 012 · Notas de voz e imágenes de los clientes
-- Se aplica con el superusuario (turnoo_admin), después de la 011.
--
-- Las notas de voz se transcriben (OpenAI) y solo se guarda el texto, en
-- mensajes.transcripcion. Las imágenes se guardan en el disco del servidor
-- (mensajes.archivo_ruta, relativa a ARCHIVOS_DIR) y se adjuntan a la cita que
-- agende el cliente. La IA no las ve.
--
--  * adjunto_error: por qué no se transcribió o guardó un adjunto. Con esto la
--    IA sabe qué decirle al cliente y no se vuelve a intentar.
--  * cita_id: la cita a la que quedó adjunta una imagen. Si la cita se borra,
--    la imagen sigue en la conversación (solo cita_id queda en NULL).
-- =====================================================================

BEGIN;

ALTER TABLE mensajes
  ADD COLUMN adjunto_error text CHECK (adjunto_error IN
    ('audio_muy_largo', 'audio_no_soportado', 'imagen_no_soportada', 'imagen_muy_grande', 'no_disponible')),
  ADD COLUMN cita_id uuid,
  ADD CONSTRAINT mensajes_cita_fk FOREIGN KEY (negocio_id, cita_id)
    REFERENCES citas (negocio_id, id) ON DELETE SET NULL (cita_id),
  ADD CONSTRAINT mensajes_cita_solo_imagen CHECK (cita_id IS NULL OR (tipo = 'imagen' AND archivo_ruta IS NOT NULL));

CREATE INDEX mensajes_cita_idx ON mensajes (cita_id) WHERE cita_id IS NOT NULL;

COMMENT ON COLUMN mensajes.adjunto_error IS
  'Por qué no se transcribió o guardó el adjunto de un mensaje entrante. NULL = sin error (o aún sin procesar).';
COMMENT ON COLUMN mensajes.cita_id IS
  'Cita a la que quedó adjunta esta imagen del cliente.';

COMMIT;
