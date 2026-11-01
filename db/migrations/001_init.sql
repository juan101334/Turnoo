-- =====================================================================
-- Turnoo · Migración 001 · Esquema inicial
-- PostgreSQL 17. Se aplica con el superusuario (turnoo_admin).
--
-- Convenciones
--  * Tablas y columnas en español, snake_case.
--  * Citas y mensajes en timestamptz (se guardan en UTC).
--    Los horarios de trabajo son "hora de pared" del negocio (time) y se
--    interpretan con negocios.zona_horaria.
--  * Dinero en pesos colombianos enteros (COP), sin decimales.
--  * Estados con CHECK en vez de ENUM: ampliar un estado es una migración simple.
--  * Toda tabla de un negocio lleva negocio_id y Row Level Security (RLS).
--  * Las claves foráneas entre tablas de negocio son compuestas
--    (negocio_id, id): la base de datos impide mezclar datos de dos negocios.
--
-- Cómo usa la aplicación el aislamiento (siempre dentro de una transacción):
--    BEGIN;
--    SELECT set_config('app.negocio_id', '<uuid del negocio>', true);
--    ... consultas ...
--    COMMIT;
--  Tareas internas y superadmin: set_config('app.es_sistema', 'true', true).
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;  -- evita citas dobles (EXCLUDE)
CREATE EXTENSION IF NOT EXISTS citext;      -- correos sin distinguir mayúsculas

-- ---------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------

CREATE FUNCTION app_negocio_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.negocio_id', true), '')::uuid
$$;

CREATE FUNCTION app_es_sistema() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.es_sistema', true), '') = 'true'
$$;

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------
-- Planes y negocios
-- ---------------------------------------------------------------------

CREATE TABLE planes (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                    text NOT NULL UNIQUE,
  precio_mensual_cop        integer NOT NULL CHECK (precio_mensual_cop >= 0),
  max_profesionales         integer CHECK (max_profesionales > 0),
  max_citas_mes             integer CHECK (max_citas_mes > 0),
  max_conversaciones_ia_mes integer CHECK (max_conversaciones_ia_mes > 0),
  activo                    boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE planes IS 'NULL en un límite significa sin límite.';

CREATE TABLE negocios (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            text NOT NULL,
  telefono_avisos   text CHECK (telefono_avisos ~ '^[0-9]{8,15}$'),
  zona_horaria      text NOT NULL DEFAULT 'America/Bogota',
  estado            text NOT NULL DEFAULT 'prueba'
                    CHECK (estado IN ('prueba', 'activo', 'suspendido')),
  plan_id           uuid REFERENCES planes (id),
  prueba_hasta      timestamptz,
  pagado_hasta      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN negocios.telefono_avisos IS
  'WhatsApp del dueño (solo dígitos, con indicativo) para avisarle cuando la IA deriva.';

CREATE TABLE configuracion_negocio (
  negocio_id                  uuid PRIMARY KEY REFERENCES negocios (id) ON DELETE CASCADE,
  intervalo_minutos           integer NOT NULL DEFAULT 15
                              CHECK (intervalo_minutos IN (5, 10, 15, 20, 30, 60)),
  anticipacion_min_minutos    integer NOT NULL DEFAULT 60 CHECK (anticipacion_min_minutos >= 0),
  anticipacion_max_dias       integer NOT NULL DEFAULT 30 CHECK (anticipacion_max_dias > 0),
  max_citas_activas_cliente   integer DEFAULT 2 CHECK (max_citas_activas_cliente > 0),
  horas_limite_cancelacion    integer NOT NULL DEFAULT 2 CHECK (horas_limite_cancelacion >= 0),
  horas_recordatorio          integer NOT NULL DEFAULT 11 CHECK (horas_recordatorio > 0),
  recordatorio_no_antes_de    time NOT NULL DEFAULT '07:00',
  recordatorio_no_despues_de  time NOT NULL DEFAULT '21:00',
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN configuracion_negocio.max_citas_activas_cliente IS
  'NULL = sin límite de citas activas por cliente.';

CREATE TABLE sedes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id  uuid NOT NULL REFERENCES negocios (id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  direccion   text,
  ciudad      text,
  activa      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (negocio_id, id)
);

-- ---------------------------------------------------------------------
-- Usuarios del panel
-- ---------------------------------------------------------------------

CREATE TABLE usuarios (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id       uuid REFERENCES negocios (id) ON DELETE CASCADE,
  email            citext NOT NULL UNIQUE,
  password_hash    text,
  nombre           text NOT NULL,
  rol              text NOT NULL CHECK (rol IN ('superadmin', 'dueno', 'empleado')),
  activo           boolean NOT NULL DEFAULT false,
  ultimo_login_en  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT superadmin_sin_negocio CHECK ((rol = 'superadmin') = (negocio_id IS NULL)),
  UNIQUE (negocio_id, id)
);
COMMENT ON COLUMN usuarios.password_hash IS
  'NULL mientras el usuario invitado no haya definido su contraseña. Guardar solo hash (argon2 o bcrypt).';

CREATE TABLE tokens_usuario (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN ('invitacion', 'recuperacion')),
  token_hash  text NOT NULL UNIQUE,
  expira_en   timestamptz NOT NULL,
  usado_en    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE tokens_usuario IS
  'Guardar solo el hash del token; el token en claro viaja únicamente en el correo.';

-- ---------------------------------------------------------------------
-- Profesionales, horarios y servicios
-- ---------------------------------------------------------------------

CREATE TABLE profesionales (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id  uuid NOT NULL REFERENCES negocios (id) ON DELETE CASCADE,
  sede_id     uuid NOT NULL,
  usuario_id  uuid UNIQUE,
  nombre      text NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (negocio_id, id),
  FOREIGN KEY (negocio_id, sede_id)    REFERENCES sedes (negocio_id, id),
  FOREIGN KEY (negocio_id, usuario_id) REFERENCES usuarios (negocio_id, id)
);
COMMENT ON COLUMN profesionales.usuario_id IS
  'Usuario del panel con el que este barbero entra a ver su agenda (opcional).';

CREATE TABLE horarios_trabajo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id      uuid NOT NULL REFERENCES negocios (id) ON DELETE CASCADE,
  profesional_id  uuid NOT NULL,
  dia_semana      smallint NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),  -- 1 = lunes ... 7 = domingo
  hora_inicio     time NOT NULL,
  hora_fin        time NOT NULL,
  CHECK (hora_fin > hora_inicio),
  FOREIGN KEY (negocio_id, profesional_id)
    REFERENCES profesionales (negocio_id, id) ON DELETE CASCADE,
  -- Un barbero no puede tener dos rangos que se crucen el mismo día.
  -- Varios rangos por día sí: 8-12 y 14-19 (el almuerzo es el hueco).
  EXCLUDE USING gist (
    profesional_id WITH =,
    dia_semana WITH =,
    tsrange(DATE '2000-01-01' + hora_inicio, DATE '2000-01-01' + hora_fin) WITH &&
  )
);

CREATE TABLE bloqueos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id      uuid NOT NULL REFERENCES negocios (id) ON DELETE CASCADE,
  profesional_id  uuid,
  inicio          timestamptz NOT NULL,
  fin             timestamptz NOT NULL,
  motivo          text,
  CHECK (fin > inicio),
  FOREIGN KEY (negocio_id, profesional_id)
    REFERENCES profesionales (negocio_id, id) ON DELETE CASCADE
);
COMMENT ON COLUMN bloqueos.profesional_id IS
  'NULL = bloqueo de todo el negocio (festivo, cierre). Con valor = día libre o ausencia de ese barbero.';

CREATE TABLE servicios (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id        uuid NOT NULL REFERENCES negocios (id) ON DELETE CASCADE,
  profesional_id    uuid NOT NULL,
  nombre            text NOT NULL,
  duracion_minutos  integer NOT NULL CHECK (duracion_minutos BETWEEN 1 AND 480),
  precio_cop        integer NOT NULL CHECK (precio_cop >= 0),
  activo            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (negocio_id, id),
  UNIQUE (id, profesional_id),
  FOREIGN KEY (negocio_id, profesional_id) REFERENCES profesionales (negocio_id, id)
);
CREATE UNIQUE INDEX servicios_nombre_unico
  ON servicios (profesional_id, lower(nombre)) WHERE activo;
COMMENT ON TABLE servicios IS
  'Cada barbero registra sus propios servicios, con su duración y precio.';

-- ---------------------------------------------------------------------
-- Clientes y citas
-- ---------------------------------------------------------------------

CREATE TABLE clientes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id       uuid NOT NULL REFERENCES negocios (id) ON DELETE CASCADE,
  nombre           text,
  telefono         text NOT NULL CHECK (telefono ~ '^[0-9]{8,15}$'),
  notas            text,
  inasistencias    integer NOT NULL DEFAULT 0 CHECK (inasistencias >= 0),
  anonimizado_en   timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (negocio_id, telefono),
  UNIQUE (negocio_id, id)
);
COMMENT ON COLUMN clientes.telefono IS 'Solo dígitos con indicativo (formato wa_id de WhatsApp).';
COMMENT ON COLUMN clientes.anonimizado_en IS
  'Si el cliente pide borrar sus datos se anonimiza la fila (nombre, teléfono, notas) en vez de borrarla, para conservar el historial de citas.';

CREATE TABLE citas (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id               uuid NOT NULL REFERENCES negocios (id) ON DELETE CASCADE,
  sede_id                  uuid NOT NULL,
  profesional_id           uuid NOT NULL,
  cliente_id               uuid NOT NULL,
  inicio                   timestamptz NOT NULL,
  fin                      timestamptz NOT NULL,
  estado                   text NOT NULL DEFAULT 'pendiente'
                           CHECK (estado IN ('pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio')),
  precio_total_cop         integer NOT NULL DEFAULT 0 CHECK (precio_total_cop >= 0),
  notas                    text,
  origen                   text NOT NULL DEFAULT 'whatsapp' CHECK (origen IN ('whatsapp', 'panel')),
  creada_por_usuario_id    uuid,
  cancelada_por            text CHECK (cancelada_por IN ('cliente', 'negocio')),
  cancelada_en             timestamptz,
  recordatorio_enviado_en  timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (fin > inicio),
  CHECK ((estado = 'cancelada') = (cancelada_en IS NOT NULL)),
  UNIQUE (negocio_id, id),
  UNIQUE (id, profesional_id),
  FOREIGN KEY (negocio_id, sede_id)               REFERENCES sedes (negocio_id, id),
  FOREIGN KEY (negocio_id, profesional_id)        REFERENCES profesionales (negocio_id, id),
  FOREIGN KEY (negocio_id, cliente_id)            REFERENCES clientes (negocio_id, id),
  FOREIGN KEY (negocio_id, creada_por_usuario_id) REFERENCES usuarios (negocio_id, id),
  -- Un barbero no puede tener dos citas activas que se solapen.
  -- Es la garantía final contra citas dobles, aunque dos clientes pidan a la vez.
  EXCLUDE USING gist (
    profesional_id WITH =,
    tstzrange(inicio, fin, '[)') WITH &&
  ) WHERE (estado IN ('pendiente', 'confirmada'))
);
COMMENT ON COLUMN citas.estado IS
  'pendiente = agendada; confirmada = el cliente la confirmó (fase 2); completada; cancelada; no_asistio.';

CREATE TABLE cita_servicios (
  cita_id           uuid NOT NULL,
  servicio_id       uuid NOT NULL,
  negocio_id        uuid NOT NULL REFERENCES negocios (id) ON DELETE CASCADE,
  profesional_id    uuid NOT NULL,
  nombre            text NOT NULL,
  duracion_minutos  integer NOT NULL CHECK (duracion_minutos > 0),
  precio_cop        integer NOT NULL CHECK (precio_cop >= 0),
  orden             smallint NOT NULL DEFAULT 1,
  PRIMARY KEY (cita_id, servicio_id),
  -- Todos los servicios de una cita deben ser del mismo barbero que la cita.
  FOREIGN KEY (cita_id, profesional_id)
    REFERENCES citas (id, profesional_id) ON DELETE CASCADE,
  FOREIGN KEY (servicio_id, profesional_id)
    REFERENCES servicios (id, profesional_id)
);
COMMENT ON TABLE cita_servicios IS
  'Nombre, duración y precio se copian al agendar: si el barbero cambia su precio después, las citas viejas no cambian.';

-- ---------------------------------------------------------------------
-- WhatsApp, conversaciones y mensajes
-- ---------------------------------------------------------------------

CREATE TABLE whatsapp_cuentas (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id             uuid NOT NULL REFERENCES negocios (id) ON DELETE CASCADE,
  profesional_id         uuid,
  phone_number_id        text NOT NULL UNIQUE,
  waba_id                text NOT NULL,
  numero_visible         text NOT NULL,
  token_acceso_cifrado   text NOT NULL,
  activa                 boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (negocio_id, id),
  FOREIGN KEY (negocio_id, profesional_id) REFERENCES profesionales (negocio_id, id)
);
COMMENT ON COLUMN whatsapp_cuentas.profesional_id IS
  'NULL = número del negocio (recepción). Con valor = número propio de ese barbero (no se usa en el MVP).';
COMMENT ON COLUMN whatsapp_cuentas.token_acceso_cifrado IS
  'Token de Meta cifrado por la aplicación; la clave NO vive en la base de datos.';

CREATE TABLE conversaciones (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id                 uuid NOT NULL REFERENCES negocios (id) ON DELETE CASCADE,
  cliente_id                 uuid NOT NULL,
  whatsapp_cuenta_id         uuid NOT NULL,
  estado                     text NOT NULL DEFAULT 'bot'
                             CHECK (estado IN ('bot', 'humano', 'cerrada')),
  ultimo_mensaje_cliente_en  timestamptz,
  ultimo_mensaje_en          timestamptz,
  ia_contada_periodo         date,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (whatsapp_cuenta_id, cliente_id),
  UNIQUE (negocio_id, id),
  FOREIGN KEY (negocio_id, cliente_id)         REFERENCES clientes (negocio_id, id),
  FOREIGN KEY (negocio_id, whatsapp_cuenta_id) REFERENCES whatsapp_cuentas (negocio_id, id)
);
COMMENT ON COLUMN conversaciones.ultimo_mensaje_cliente_en IS
  'Con esto se sabe si la ventana de 24 horas de WhatsApp sigue abierta.';
COMMENT ON COLUMN conversaciones.ia_contada_periodo IS
  'Primer día del mes en que esta conversación ya se contó para el límite de IA del plan (cuenta una vez por mes).';

CREATE TABLE mensajes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id       uuid NOT NULL REFERENCES negocios (id) ON DELETE CASCADE,
  conversacion_id  uuid NOT NULL,
  wa_message_id    text UNIQUE,
  direccion        text NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
  emisor           text NOT NULL CHECK (emisor IN ('cliente', 'ia', 'humano', 'sistema')),
  tipo             text NOT NULL CHECK (tipo IN ('texto', 'audio', 'imagen', 'plantilla', 'otro')),
  contenido        text,
  transcripcion    text,
  archivo_ruta     text,
  estado_entrega   text CHECK (estado_entrega IN ('enviado', 'entregado', 'leido', 'fallido')),
  error            text,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  CHECK ((direccion = 'entrante') = (emisor = 'cliente')),
  FOREIGN KEY (negocio_id, conversacion_id)
    REFERENCES conversaciones (negocio_id, id) ON DELETE CASCADE
);
COMMENT ON COLUMN mensajes.wa_message_id IS
  'ID del mensaje en WhatsApp. Es UNIQUE: si Meta reenvía un webhook, el segundo INSERT se ignora (ON CONFLICT DO NOTHING).';

-- ---------------------------------------------------------------------
-- Conocimiento de la IA y derivaciones a una persona
-- ---------------------------------------------------------------------

CREATE TABLE conocimiento (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id  uuid NOT NULL REFERENCES negocios (id) ON DELETE CASCADE,
  pregunta    text NOT NULL,
  respuesta   text NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE derivaciones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id       uuid NOT NULL REFERENCES negocios (id) ON DELETE CASCADE,
  conversacion_id  uuid NOT NULL,
  motivo           text NOT NULL CHECK (motivo IN
                     ('fuera_de_tema', 'sin_informacion', 'cliente_pidio_humano',
                      'sin_comprension', 'limite_plan', 'error')),
  detalle          text,
  avisada_en       timestamptz,
  atendida_en      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (negocio_id, conversacion_id)
    REFERENCES conversaciones (negocio_id, id) ON DELETE CASCADE
);
COMMENT ON COLUMN derivaciones.detalle IS
  'Lo que preguntó el cliente. Se revisa cada semana para completar la tabla conocimiento.';

-- ---------------------------------------------------------------------
-- Consentimiento de datos, uso por plan y pagos
-- ---------------------------------------------------------------------

CREATE TABLE consentimientos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id        uuid NOT NULL REFERENCES negocios (id) ON DELETE CASCADE,
  cliente_id        uuid NOT NULL,
  version_politica  text NOT NULL,
  aceptado_en       timestamptz NOT NULL DEFAULT now(),
  wa_message_id     text,
  UNIQUE (cliente_id, version_politica),
  FOREIGN KEY (negocio_id, cliente_id)
    REFERENCES clientes (negocio_id, id) ON DELETE CASCADE
);

CREATE TABLE uso_mensual (
  negocio_id                  uuid NOT NULL REFERENCES negocios (id) ON DELETE CASCADE,
  periodo                     date NOT NULL CHECK (EXTRACT(DAY FROM periodo) = 1),
  citas_creadas               integer NOT NULL DEFAULT 0,
  conversaciones_ia           integer NOT NULL DEFAULT 0,
  plantillas_enviadas         integer NOT NULL DEFAULT 0,
  segundos_audio_transcritos  integer NOT NULL DEFAULT 0,
  tokens_entrada              bigint  NOT NULL DEFAULT 0,
  tokens_salida               bigint  NOT NULL DEFAULT 0,
  PRIMARY KEY (negocio_id, periodo)
);
COMMENT ON TABLE uso_mensual IS
  'Contadores por negocio y mes. Sirven para aplicar los límites del plan y para calcular el costo real de cada negocio.';

CREATE TABLE pagos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id      uuid NOT NULL REFERENCES negocios (id) ON DELETE CASCADE,
  monto_cop       integer NOT NULL CHECK (monto_cop > 0),
  metodo          text NOT NULL CHECK (metodo IN ('transferencia', 'nequi', 'daviplata', 'efectivo', 'otro')),
  referencia      text,
  periodo_desde   date NOT NULL,
  periodo_hasta   date NOT NULL,
  notas           text,
  registrado_por  uuid REFERENCES usuarios (id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (periodo_hasta >= periodo_desde)
);

-- ---------------------------------------------------------------------
-- Índices (además de los que crean las claves y restricciones UNIQUE)
-- ---------------------------------------------------------------------

CREATE INDEX citas_negocio_inicio_idx     ON citas (negocio_id, inicio);
CREATE INDEX citas_profesional_inicio_idx ON citas (profesional_id, inicio);
CREATE INDEX citas_cliente_inicio_idx     ON citas (cliente_id, inicio);
CREATE INDEX citas_recordatorio_idx       ON citas (inicio)
  WHERE estado IN ('pendiente', 'confirmada') AND recordatorio_enviado_en IS NULL;
CREATE INDEX horarios_profesional_idx     ON horarios_trabajo (profesional_id, dia_semana);
CREATE INDEX bloqueos_negocio_inicio_idx  ON bloqueos (negocio_id, inicio, fin);
CREATE INDEX servicios_profesional_idx    ON servicios (profesional_id) WHERE activo;
CREATE INDEX mensajes_conversacion_idx    ON mensajes (conversacion_id, creado_en);
CREATE INDEX conversaciones_estado_idx    ON conversaciones (negocio_id, estado);
CREATE INDEX derivaciones_pendientes_idx  ON derivaciones (negocio_id, created_at)
  WHERE atendida_en IS NULL;
CREATE INDEX tokens_usuario_usuario_idx   ON tokens_usuario (usuario_id);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['negocios', 'configuracion_negocio', 'usuarios', 'clientes',
                           'citas', 'conversaciones', 'conocimiento']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_updated_at', t);
  END LOOP;
END $$;

-- Cada negocio nuevo recibe su configuración por defecto y una sede principal.
CREATE FUNCTION crear_datos_base_negocio() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO configuracion_negocio (negocio_id) VALUES (NEW.id);
  INSERT INTO sedes (negocio_id, nombre) VALUES (NEW.id, 'Sede principal');
  RETURN NEW;
END $$;

CREATE TRIGGER negocios_datos_base
  AFTER INSERT ON negocios
  FOR EACH ROW EXECUTE FUNCTION crear_datos_base_negocio();

-- ---------------------------------------------------------------------
-- Row Level Security: cada negocio solo ve y escribe sus propias filas
-- ---------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'configuracion_negocio', 'sedes', 'usuarios', 'profesionales', 'horarios_trabajo',
    'bloqueos', 'servicios', 'clientes', 'citas', 'cita_servicios', 'whatsapp_cuentas',
    'conversaciones', 'mensajes', 'conocimiento', 'derivaciones', 'consentimientos',
    'uso_mensual', 'pagos']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY aislamiento_negocio ON %I
         USING (negocio_id = app_negocio_id() OR app_es_sistema())
         WITH CHECK (negocio_id = app_negocio_id() OR app_es_sistema())', t);
  END LOOP;
END $$;

ALTER TABLE negocios ENABLE ROW LEVEL SECURITY;
ALTER TABLE negocios FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_negocio ON negocios
  USING (id = app_negocio_id() OR app_es_sistema())
  WITH CHECK (id = app_negocio_id() OR app_es_sistema());

-- ---------------------------------------------------------------------
-- Consultas que ocurren ANTES de saber a qué negocio pertenece la petición
-- (llega un webhook de WhatsApp, o alguien intenta iniciar sesión).
-- Son las únicas puertas que saltan el RLS, y solo devuelven lo necesario.
-- ---------------------------------------------------------------------

CREATE FUNCTION fn_buscar_cuenta_whatsapp(p_phone_number_id text)
RETURNS TABLE (cuenta_id uuid, negocio_id uuid, profesional_id uuid,
               token_acceso_cifrado text, estado_negocio text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id, c.negocio_id, c.profesional_id, c.token_acceso_cifrado, n.estado
  FROM whatsapp_cuentas c
  JOIN negocios n ON n.id = c.negocio_id
  WHERE c.phone_number_id = p_phone_number_id AND c.activa
$$;

CREATE FUNCTION fn_usuario_para_login(p_email citext)
RETURNS TABLE (id uuid, negocio_id uuid, rol text, nombre text,
               password_hash text, activo boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id, u.negocio_id, u.rol, u.nombre, u.password_hash, u.activo
  FROM usuarios u
  WHERE u.email = p_email
$$;

-- ---------------------------------------------------------------------
-- Rol de la aplicación: sin superusuario y sin poder saltarse el RLS
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'turnoo_app') THEN
    CREATE ROLE turnoo_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO turnoo_app', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO turnoo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO turnoo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO turnoo_app;

REVOKE ALL ON FUNCTION fn_buscar_cuenta_whatsapp(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_usuario_para_login(citext)   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_buscar_cuenta_whatsapp(text) TO turnoo_app;
GRANT EXECUTE ON FUNCTION fn_usuario_para_login(citext)   TO turnoo_app;

COMMIT;
