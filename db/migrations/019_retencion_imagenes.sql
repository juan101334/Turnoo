-- =====================================================================
-- Turnoo · Migración 019 · Retención de las imágenes de los clientes
-- Se aplica con el superusuario (npm run db:migrar), después de la 018.
--
-- Las imágenes que mandan los clientes se borran del disco cuando cumplen
-- RETENCION_IMAGENES_DIAS (backend/.env). La tarea que las busca corre cada
-- minuto: este índice le evita recorrer todos los mensajes, porque solo
-- contiene los que todavía tienen un archivo guardado.
-- =====================================================================

BEGIN;

CREATE INDEX mensajes_con_archivo_idx ON mensajes (creado_en) WHERE archivo_ruta IS NOT NULL;

COMMIT;
