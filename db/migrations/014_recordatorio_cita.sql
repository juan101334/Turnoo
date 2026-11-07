-- =====================================================================
-- Turnoo · Migración 014 · Recordatorio de la cita por plantilla
-- Se aplica con el superusuario (npm run db:migrar), después de la 013.
--
-- Una tarea interna envía un recordatorio por cita, unas horas antes
-- (configuracion_negocio.horas_recordatorio), dentro del horario permitido.
--
--  * citas.recordatorio_resultado: NULL = pendiente; 'enviado'; 'fallido';
--    'vencido' (llegó la cita sin poder enviarlo); 'agendada_tarde' (se agendó
--    o reprogramó cuando ya había pasado el momento del recordatorio);
--    'sin_consentimiento' (el cliente no ha aceptado el aviso de datos);
--    'sin_telefono' (el cliente escribe sin compartir su número).
--  * citas.recordatorio_intentos / recordatorio_reservado_hasta: reintentos y
--    reserva por tiempo, igual que los avisos al dueño.
--  * citas.programada_en: cuándo se fijó la hora actual de la cita (al crearla
--    o al reprogramarla). Decide si se agendó tarde.
-- =====================================================================

BEGIN;

ALTER TABLE citas
  ADD COLUMN recordatorio_resultado text CHECK (recordatorio_resultado IN
    ('enviado', 'fallido', 'vencido', 'agendada_tarde', 'sin_consentimiento', 'sin_telefono')),
  ADD COLUMN recordatorio_intentos        integer NOT NULL DEFAULT 0 CHECK (recordatorio_intentos >= 0),
  ADD COLUMN recordatorio_reservado_hasta timestamptz,
  ADD COLUMN programada_en                timestamptz;

UPDATE citas SET programada_en = created_at;
ALTER TABLE citas ALTER COLUMN programada_en SET NOT NULL,
                  ALTER COLUMN programada_en SET DEFAULT now();

-- Las citas que ya empezaron no se recuerdan; las que tienen fecha de envío ya se enviaron.
UPDATE citas SET recordatorio_resultado = 'enviado' WHERE recordatorio_enviado_en IS NOT NULL;
UPDATE citas SET recordatorio_resultado = 'vencido'
 WHERE recordatorio_enviado_en IS NULL AND inicio <= now();

ALTER TABLE citas ADD CONSTRAINT citas_recordatorio_enviado_con_fecha
  CHECK ((recordatorio_resultado = 'enviado') = (recordatorio_enviado_en IS NOT NULL));

-- El índice anterior miraba recordatorio_enviado_en; ahora lo pendiente es resultado NULL.
DROP INDEX citas_recordatorio_idx;
CREATE INDEX citas_recordatorio_pendiente_idx ON citas (inicio)
  WHERE recordatorio_resultado IS NULL AND estado IN ('pendiente', 'confirmada');

COMMENT ON COLUMN citas.recordatorio_resultado IS
  'Recordatorio: NULL pendiente, enviado, fallido, vencido, agendada_tarde, sin_consentimiento o sin_telefono.';
COMMENT ON COLUMN citas.programada_en IS
  'Cuándo se fijó la hora actual de la cita (creación o última reprogramación).';

COMMIT;
