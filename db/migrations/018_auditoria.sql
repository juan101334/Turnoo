-- =====================================================================
-- Turnoo · Migración 018 · Registro de auditoría
-- Se aplica con el superusuario (npm run db:migrar), después de la 017.
--
-- Quién hizo qué y cuándo, para investigar un acceso raro: entradas correctas
-- y fallidas, cierres de sesión, cambios de contraseña, invitaciones y enlaces
-- de recuperación, y las acciones del superadmin sobre los negocios (plan,
-- estado, cuentas de WhatsApp).
--
-- Nunca se guarda una contraseña, un token, un correo ni un teléfono. La IP va
-- recortada a su red (/24 en IPv4, /48 en IPv6): alcanza para ver de dónde
-- viene un ataque sin guardar la dirección exacta de cada persona. `detalle`
-- solo lleva ids y valores cortos (el plan nuevo, el rol invitado, el motivo
-- de un fallo).
--
-- Solo se agrega: la aplicación (turnoo_app) puede insertar y leer, pero no
-- cambiar ni borrar, así una intrusión en la API no puede borrar su rastro.
-- Sin claves foráneas a propósito: el registro sigue aunque se borre el
-- usuario o el negocio.
-- =====================================================================

BEGIN;

CREATE TABLE auditoria (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en   timestamptz NOT NULL DEFAULT now(),
  accion      text NOT NULL CHECK (accion IN (
                'login_correcto',
                'login_fallido',
                'cerrar_sesion',
                'cerrar_otras_sesiones',
                'cambiar_contrasena',
                'restablecer_contrasena',
                'aceptar_invitacion',
                'invitar_usuario',
                'reenviar_invitacion',
                'generar_recuperacion',
                'desactivar_usuario',
                'crear_negocio',
                'cambiar_plan_estado',
                'registrar_whatsapp',
                'cambiar_whatsapp'
              )),
  -- Quien hizo la acción (null en un login fallido de una cuenta que no existe).
  usuario_id  uuid,
  -- El negocio afectado: el del usuario o, para el superadmin, el negocio sobre el que actuó.
  negocio_id  uuid,
  ip_red      text CHECK (char_length(ip_red) <= 64),
  detalle     jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detalle) = 'object')
);
CREATE INDEX auditoria_fecha_idx ON auditoria (creado_en);
CREATE INDEX auditoria_usuario_idx ON auditoria (usuario_id, creado_en);
CREATE INDEX auditoria_negocio_idx ON auditoria (negocio_id, creado_en);

ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_negocio ON auditoria
  USING (negocio_id = app_negocio_id() OR app_es_sistema())
  WITH CHECK (negocio_id = app_negocio_id() OR app_es_sistema());

-- Solo agregar (ver arriba). Los permisos por defecto de la 001 dan los cuatro.
REVOKE UPDATE, DELETE, TRUNCATE ON auditoria FROM turnoo_app;

COMMENT ON TABLE auditoria IS
  'Registro de acciones de seguridad (logins, contraseñas, invitaciones, superadmin). Solo se agrega. Sin contraseñas, tokens, correos ni teléfonos; IP recortada a su red.';

COMMIT;
