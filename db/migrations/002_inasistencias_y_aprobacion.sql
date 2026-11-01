-- =====================================================================
-- Turnoo · Migración 002 · Inasistencias, aprobación de citas, modo humano
-- Se aplica con el superusuario (turnoo_admin), después de la 001.
--
-- Qué agrega
--  * Estado de cita 'por_aprobar': cliente con muchas inasistencias recientes;
--    el barbero debe aprobar la cita. Reserva el hueco mientras espera.
--  * Reglas configurables por negocio: umbral de inasistencias, tiempos de
--    espera, regreso de 'humano' a la IA y autocompletado de citas.
--  * Validación de transiciones de estado de la cita directamente en la base.
--  * Las inasistencias ya no se guardan en un contador: se cuentan desde las
--    citas 'no_asistio' dentro de la ventana de días del negocio.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Configuración por negocio
-- ---------------------------------------------------------------------

ALTER TABLE configuracion_negocio
  ADD COLUMN max_inasistencias              integer NOT NULL DEFAULT 3
    CHECK (max_inasistencias > 0),
  ADD COLUMN ventana_inasistencias_dias     integer NOT NULL DEFAULT 30
    CHECK (ventana_inasistencias_dias > 0),
  ADD COLUMN horas_espera_aprobacion        integer NOT NULL DEFAULT 2
    CHECK (horas_espera_aprobacion > 0),
  ADD COLUMN aprobacion_minutos_antes_cita  integer NOT NULL DEFAULT 60
    CHECK (aprobacion_minutos_antes_cita >= 0),
  ADD COLUMN horas_modo_humano              integer NOT NULL DEFAULT 2
    CHECK (horas_modo_humano > 0),
  ADD COLUMN horas_autocompletar_cita       integer NOT NULL DEFAULT 24
    CHECK (horas_autocompletar_cita > 0);

COMMENT ON COLUMN configuracion_negocio.max_inasistencias IS
  'Con este número de inasistencias dentro de la ventana, las citas nuevas del cliente pasan a ''por_aprobar''.';
COMMENT ON COLUMN configuracion_negocio.horas_espera_aprobacion IS
  'Cuánto espera una cita ''por_aprobar'' la respuesta del barbero antes de liberar el hueco.';
COMMENT ON COLUMN configuracion_negocio.aprobacion_minutos_antes_cita IS
  'Tope: la espera nunca pasa de este margen antes de la hora de la cita.';
COMMENT ON COLUMN configuracion_negocio.horas_modo_humano IS
  'Pasado este tiempo desde la derivación, la conversación vuelve sola a la IA.';
COMMENT ON COLUMN configuracion_negocio.horas_autocompletar_cita IS
  'Una cita pasada que nadie marcó se completa sola después de este tiempo.';

-- ---------------------------------------------------------------------
-- Citas: estado 'por_aprobar' y plazo de aprobación
-- ---------------------------------------------------------------------

ALTER TABLE citas DROP CONSTRAINT citas_estado_check;
ALTER TABLE citas ADD CONSTRAINT citas_estado_check
  CHECK (estado IN ('por_aprobar', 'pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio'));

ALTER TABLE citas ADD COLUMN aprobacion_expira_en timestamptz;
ALTER TABLE citas ADD CONSTRAINT citas_por_aprobar_con_plazo
  CHECK (estado <> 'por_aprobar' OR aprobacion_expira_en IS NOT NULL);

-- Una cita 'por_aprobar' también ocupa el hueco del barbero.
ALTER TABLE citas DROP CONSTRAINT citas_profesional_id_tstzrange_excl;
ALTER TABLE citas ADD CONSTRAINT citas_sin_solapes EXCLUDE USING gist (
  profesional_id WITH =,
  tstzrange(inicio, fin, '[)') WITH &&
) WHERE (estado IN ('por_aprobar', 'pendiente', 'confirmada'));

COMMENT ON COLUMN citas.estado IS
  'por_aprobar = espera aprobación del barbero; pendiente = agendada; confirmada = el cliente la confirmó (fase 2); completada; cancelada; no_asistio.';

-- Transiciones permitidas. Cancelada es final. 'completada' y 'no_asistio'
-- se pueden corregir entre sí (el barbero se equivocó o llegó tarde).
CREATE FUNCTION validar_transicion_cita() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado = OLD.estado THEN
    RETURN NEW;
  END IF;
  IF (OLD.estado, NEW.estado) IN (
       ('por_aprobar', 'pendiente'),  ('por_aprobar', 'cancelada'),
       ('pendiente',   'confirmada'), ('pendiente',   'cancelada'),
       ('pendiente',   'completada'), ('pendiente',   'no_asistio'),
       ('confirmada',  'cancelada'),  ('confirmada',  'completada'),
       ('confirmada',  'no_asistio'),
       ('completada',  'no_asistio'), ('no_asistio',  'completada')) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Transición de cita no permitida: % -> %', OLD.estado, NEW.estado
    USING ERRCODE = 'check_violation';
END $$;

CREATE TRIGGER citas_validar_transicion
  BEFORE UPDATE OF estado ON citas
  FOR EACH ROW EXECUTE FUNCTION validar_transicion_cita();

-- ---------------------------------------------------------------------
-- Clientes: las inasistencias se cuentan desde las citas
-- ---------------------------------------------------------------------

ALTER TABLE clientes DROP COLUMN inasistencias;

CREATE INDEX citas_inasistencias_idx
  ON citas (negocio_id, cliente_id, inicio) WHERE estado = 'no_asistio';

-- ---------------------------------------------------------------------
-- Índices para las tareas programadas
-- ---------------------------------------------------------------------

CREATE INDEX citas_por_aprobar_idx
  ON citas (aprobacion_expira_en) WHERE estado = 'por_aprobar';
CREATE INDEX citas_autocompletar_idx
  ON citas (fin) WHERE estado IN ('pendiente', 'confirmada');

-- ---------------------------------------------------------------------
-- Conversaciones: desde cuándo está en modo humano
-- ---------------------------------------------------------------------

ALTER TABLE conversaciones ADD COLUMN humano_desde timestamptz;
ALTER TABLE conversaciones ADD CONSTRAINT conversaciones_humano_con_fecha
  CHECK (estado <> 'humano' OR humano_desde IS NOT NULL);

COMMENT ON COLUMN conversaciones.humano_desde IS
  'Momento de la derivación. Al llegar un mensaje, si ya pasó configuracion_negocio.horas_modo_humano, la conversación vuelve a ''bot''.';

COMMIT;
