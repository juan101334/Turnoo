import type { Transaccion } from '../../db/contexto.js';
import type { CuentaRegistrada, EmisorSaliente, MensajeEntrante } from './whatsapp.tipos.js';

/** Bloquea la conversación: los mensajes de un mismo cliente se guardan de uno en uno. */
export async function obtenerOCrearConversacion(
  tx: Transaccion,
  negocioId: string,
  clienteId: string,
  cuentaId: string,
): Promise<string> {
  const { rows } = await tx.consultar<{ id: string }>(
    `INSERT INTO conversaciones (negocio_id, cliente_id, whatsapp_cuenta_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (whatsapp_cuenta_id, cliente_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [negocioId, clienteId, cuentaId],
  );
  return rows[0]!.id;
}

/** Devuelve false si el mensaje ya estaba: Meta puede enviar el mismo más de una vez. */
export async function guardarMensajeEntrante(
  tx: Transaccion,
  negocioId: string,
  conversacionId: string,
  mensaje: MensajeEntrante,
): Promise<boolean> {
  const { rowCount } = await tx.consultar(
    `INSERT INTO mensajes (negocio_id, conversacion_id, wa_message_id, direccion, emisor, tipo, contenido, media_id, creado_en)
     VALUES ($1, $2, $3, 'entrante', 'cliente', $4, $5, $6, $7)
     ON CONFLICT (wa_message_id) DO NOTHING`,
    [negocioId, conversacionId, mensaje.waMessageId, mensaje.tipo, mensaje.contenido, mensaje.mediaId, mensaje.enviadoEn],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Anota la actividad y devuelve la conversación a la IA si ya pasaron las horas del modo humano:
 * es una evaluación al llegar el mensaje, no una tarea. GREATEST: un reenvío atrasado no retrocede
 * las fechas, de las que depende la ventana de 24 h de WhatsApp.
 */
export async function registrarMensajeDelCliente(
  tx: Transaccion,
  conversacionId: string,
  enviadoEn: Date,
): Promise<void> {
  await tx.consultar(
    `UPDATE conversaciones c
        SET ultimo_mensaje_cliente_en = GREATEST(c.ultimo_mensaje_cliente_en, $2),
            ultimo_mensaje_en = GREATEST(c.ultimo_mensaje_en, $2),
            estado = CASE WHEN c.estado = 'humano'
                           AND c.humano_desde + make_interval(hours => cfg.horas_modo_humano) <= $2
                          THEN 'bot' ELSE c.estado END,
            humano_desde = CASE WHEN c.estado = 'humano'
                                 AND c.humano_desde + make_interval(hours => cfg.horas_modo_humano) <= $2
                                THEN NULL ELSE c.humano_desde END
       FROM configuracion_negocio cfg
      WHERE c.id = $1 AND cfg.negocio_id = c.negocio_id`,
    [conversacionId, enviadoEn],
  );
}

// ---------------------------------------------------------------------
// Cuentas de WhatsApp de un negocio
// ---------------------------------------------------------------------

const COLUMNAS_CUENTA = 'id, phone_number_id, waba_id, numero_visible, activa, created_at';

interface FilaCuenta {
  id: string;
  phone_number_id: string;
  waba_id: string;
  numero_visible: string;
  activa: boolean;
  created_at: Date;
}

const aCuenta = (f: FilaCuenta): CuentaRegistrada => ({
  id: f.id,
  phoneNumberId: f.phone_number_id,
  wabaId: f.waba_id,
  numeroVisible: f.numero_visible,
  activa: f.activa,
  createdAt: f.created_at,
});

export async function crearCuenta(
  tx: Transaccion,
  negocioId: string,
  datos: { phoneNumberId: string; wabaId: string; numeroVisible: string; tokenCifrado: string },
): Promise<CuentaRegistrada> {
  const { rows } = await tx.consultar<FilaCuenta>(
    `INSERT INTO whatsapp_cuentas (negocio_id, phone_number_id, waba_id, numero_visible, token_acceso_cifrado)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNAS_CUENTA}`,
    [negocioId, datos.phoneNumberId, datos.wabaId, datos.numeroVisible, datos.tokenCifrado],
  );
  return aCuenta(rows[0]!);
}

export async function listarCuentas(tx: Transaccion): Promise<CuentaRegistrada[]> {
  const { rows } = await tx.consultar<FilaCuenta>(
    `SELECT ${COLUMNAS_CUENTA} FROM whatsapp_cuentas ORDER BY created_at, id`,
  );
  return rows.map(aCuenta);
}

/** Solo cambia lo que viene; devuelve null si la cuenta no existe en este negocio. */
export async function actualizarCuenta(
  tx: Transaccion,
  cuentaId: string,
  cambios: { numeroVisible?: string | undefined; tokenCifrado?: string | undefined; activa?: boolean | undefined },
): Promise<CuentaRegistrada | null> {
  const { rows } = await tx.consultar<FilaCuenta>(
    `UPDATE whatsapp_cuentas
        SET numero_visible = COALESCE($2, numero_visible),
            token_acceso_cifrado = COALESCE($3, token_acceso_cifrado),
            activa = COALESCE($4, activa)
      WHERE id = $1
      RETURNING ${COLUMNAS_CUENTA}`,
    [cuentaId, cambios.numeroVisible ?? null, cambios.tokenCifrado ?? null, cambios.activa ?? null],
  );
  return rows[0] ? aCuenta(rows[0]) : null;
}

// ---------------------------------------------------------------------
// Mensajes salientes
// ---------------------------------------------------------------------

export interface DestinoConversacion {
  telefono: string | null;
  waUserId: string | null;
  ultimoMensajeClienteEn: Date | null;
  phoneNumberId: string;
  tokenCifrado: string;
  cuentaActiva: boolean;
}

/** Bloquea la conversación: dos envíos a la misma persona se guardan en orden. */
export async function destinoDeConversacion(tx: Transaccion, conversacionId: string): Promise<DestinoConversacion | null> {
  const { rows } = await tx.consultar<{
    telefono: string | null;
    wa_user_id: string | null;
    ultimo_mensaje_cliente_en: Date | null;
    phone_number_id: string;
    token_acceso_cifrado: string;
    activa: boolean;
  }>(
    `SELECT cl.telefono, cl.wa_user_id, c.ultimo_mensaje_cliente_en, w.phone_number_id, w.token_acceso_cifrado, w.activa
       FROM conversaciones c
       JOIN clientes cl ON cl.id = c.cliente_id
       JOIN whatsapp_cuentas w ON w.id = c.whatsapp_cuenta_id
      WHERE c.id = $1
        FOR UPDATE OF c`,
    [conversacionId],
  );
  const fila = rows[0];
  if (!fila) return null;
  return {
    telefono: fila.telefono,
    waUserId: fila.wa_user_id,
    ultimoMensajeClienteEn: fila.ultimo_mensaje_cliente_en,
    phoneNumberId: fila.phone_number_id,
    tokenCifrado: fila.token_acceso_cifrado,
    cuentaActiva: fila.activa,
  };
}

/** Se guarda ANTES de enviar, sin estado de entrega: si el proceso cae a mitad, queda el rastro. */
export async function guardarMensajeSaliente(
  tx: Transaccion,
  negocioId: string,
  conversacionId: string,
  emisor: EmisorSaliente,
  texto: string,
  ahora: Date,
): Promise<string> {
  const { rows } = await tx.consultar<{ id: string }>(
    `INSERT INTO mensajes (negocio_id, conversacion_id, direccion, emisor, tipo, contenido, creado_en)
     VALUES ($1, $2, 'saliente', $3, 'texto', $4, $5) RETURNING id`,
    [negocioId, conversacionId, emisor, texto, ahora],
  );
  await tx.consultar(
    'UPDATE conversaciones SET ultimo_mensaje_en = GREATEST(ultimo_mensaje_en, $2), updated_at = now() WHERE id = $1',
    [conversacionId, ahora],
  );
  return rows[0]!.id;
}

export async function registrarResultadoEnvio(
  tx: Transaccion,
  mensajeId: string,
  resultado: { waMessageId: string } | { error: string },
): Promise<void> {
  if ('waMessageId' in resultado) {
    await tx.consultar(
      `UPDATE mensajes SET wa_message_id = $2, estado_entrega = 'enviado' WHERE id = $1`,
      [mensajeId, resultado.waMessageId],
    );
  } else {
    await tx.consultar(
      `UPDATE mensajes SET estado_entrega = 'fallido', error = $2 WHERE id = $1`,
      [mensajeId, resultado.error],
    );
  }
}

// ---------------------------------------------------------------------
// Aviso de tratamiento de datos y consentimiento
// ---------------------------------------------------------------------

/**
 * Decide qué pasa con un mensaje nuevo según el aviso de datos de su cliente:
 * - `aceptado`: ya aceptó esta versión, o la acepta ahora por escribir después de recibir el aviso
 *   (en ese caso se registra el consentimiento con el id de este mensaje).
 * - `requiere_aviso`: aún no recibió el aviso de esta versión.
 * - `esperando`: el aviso está en camino, o el mensaje se escribió antes de que llegara.
 */
export async function evaluarConsentimiento(
  tx: Transaccion,
  negocioId: string,
  clienteId: string,
  version: string,
  mensaje: { waMessageId: string; enviadoEn: Date },
): Promise<'aceptado' | 'requiere_aviso' | 'esperando'> {
  const { rows } = await tx.consultar<{
    aviso_datos_version: string | null;
    aviso_datos_enviado_en: Date | null;
    aceptado: boolean;
  }>(
    `SELECT aviso_datos_version, aviso_datos_enviado_en,
            EXISTS (SELECT 1 FROM consentimientos WHERE cliente_id = $1 AND version_politica = $2) AS aceptado
       FROM clientes WHERE id = $1`,
    [clienteId, version],
  );
  const fila = rows[0]!;
  if (fila.aceptado) return 'aceptado';
  const avisoDeEstaVersion = fila.aviso_datos_version === version && fila.aviso_datos_enviado_en !== null;
  if (!avisoDeEstaVersion) return 'requiere_aviso';
  if (mensaje.enviadoEn <= fila.aviso_datos_enviado_en!) return 'esperando';
  await tx.consultar(
    `INSERT INTO consentimientos (negocio_id, cliente_id, version_politica, aceptado_en, wa_message_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (cliente_id, version_politica) DO NOTHING`,
    [negocioId, clienteId, version, mensaje.enviadoEn, mensaje.waMessageId],
  );
  return 'aceptado';
}

/** Reserva el envío del aviso. false si ya lo recibió en esta versión o alguien lo está enviando. */
export async function reservarAviso(
  tx: Transaccion,
  clienteId: string,
  version: string,
  ahora: Date,
  minutosReserva: number,
): Promise<boolean> {
  const { rowCount } = await tx.consultar(
    `UPDATE clientes SET aviso_datos_pedido_en = $3::timestamptz
      WHERE id = $1
        AND anonimizado_en IS NULL
        AND (aviso_datos_version IS DISTINCT FROM $2 OR aviso_datos_enviado_en IS NULL)
        AND (aviso_datos_pedido_en IS NULL OR aviso_datos_pedido_en <= $3::timestamptz - make_interval(mins => $4))`,
    [clienteId, version, ahora, minutosReserva],
  );
  return (rowCount ?? 0) > 0;
}

export async function marcarAvisoEnviado(tx: Transaccion, clienteId: string, version: string, enviadoEn: Date): Promise<void> {
  await tx.consultar(
    `UPDATE clientes SET aviso_datos_version = $2, aviso_datos_enviado_en = $3, aviso_datos_pedido_en = NULL WHERE id = $1`,
    [clienteId, version, enviadoEn],
  );
}

export async function liberarAviso(tx: Transaccion, clienteId: string): Promise<void> {
  await tx.consultar('UPDATE clientes SET aviso_datos_pedido_en = NULL WHERE id = $1', [clienteId]);
}

export async function nombreDelNegocio(tx: Transaccion, negocioId: string): Promise<string> {
  const { rows } = await tx.consultar<{ nombre: string }>('SELECT nombre FROM negocios WHERE id = $1', [negocioId]);
  return rows[0]!.nombre;
}

/**
 * Deja la conversación esperando respuesta. Solo en modo `bot`: en modo humano la IA calla, y
 * registrarMensajeDelCliente ya la devolvió a `bot` si el modo humano venció.
 */
export async function marcarPendiente(tx: Transaccion, conversacionId: string, llegada: Date): Promise<void> {
  await tx.consultar(
    `UPDATE conversaciones
        SET ia_pendiente_desde = COALESCE(ia_pendiente_desde, $2),
            ia_pendiente_en = GREATEST(ia_pendiente_en, $2)
      WHERE id = $1 AND estado = 'bot'`,
    [conversacionId, llegada],
  );
}
