-- =====================================================================
-- Turnoo · Migración 009 · Aviso de tratamiento de datos
-- Se aplica con el superusuario (turnoo_admin), después de la 008.
--
-- El primer mensaje de un cliente recibe el aviso de tratamiento de datos y no
-- pasa a la IA. Se entiende aceptado cuando el cliente vuelve a escribir después
-- de recibirlo, y solo entonces se registra en `consentimientos`.
--
--  * aviso_datos_version / aviso_datos_enviado_en: qué versión del aviso se le
--    envió y cuándo lo confirmó Meta. Un mensaje del cliente posterior a esa hora
--    cuenta como aceptación de esa versión.
--  * aviso_datos_pedido_en: reserva mientras se envía, para que dos mensajes
--    simultáneos no manden el aviso dos veces. Vence sola si el proceso se cae.
-- =====================================================================

BEGIN;

ALTER TABLE clientes
  ADD COLUMN aviso_datos_version    text,
  ADD COLUMN aviso_datos_enviado_en timestamptz,
  ADD COLUMN aviso_datos_pedido_en  timestamptz,
  ADD CONSTRAINT clientes_aviso_completo
    CHECK ((aviso_datos_version IS NULL) = (aviso_datos_enviado_en IS NULL));

COMMENT ON COLUMN clientes.aviso_datos_enviado_en IS
  'Cuándo confirmó Meta el envío del aviso de datos de la versión aviso_datos_version. Un mensaje posterior del cliente es su aceptación.';
COMMENT ON COLUMN clientes.aviso_datos_pedido_en IS
  'Reserva mientras se envía el aviso; vence a los pocos minutos si el envío no terminó.';

COMMIT;
