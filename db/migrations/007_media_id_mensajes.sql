-- =====================================================================
-- Turnoo · Migración 007 · Id de los archivos que llegan por WhatsApp
-- Se aplica con el superusuario (turnoo_admin), después de la 006.
--
--  * mensajes.media_id guarda el id que Meta asigna a un audio o una imagen. Sin él
--    no se podrían descargar después, cuando exista la parte que transcribe y guarda.
-- =====================================================================

BEGIN;

ALTER TABLE mensajes ADD COLUMN media_id text;

COMMENT ON COLUMN mensajes.media_id IS
  'Id del archivo en Meta. Con él se descarga el audio o la imagen; al guardarlo, su ruta queda en archivo_ruta.';

COMMIT;
