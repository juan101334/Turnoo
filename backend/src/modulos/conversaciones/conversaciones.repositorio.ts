import type { Transaccion } from '../../db/contexto.js';
import type { ContextoDeConversacion, MensajeDelHistorial, MotivoDerivacion, PasoDeIA } from './conversaciones.tipos.js';

/** Único lugar con SQL de conversaciones y derivaciones. */

export async function datosDeLaConversacion(
  tx: Transaccion,
  conversacionId: string,
): Promise<Omit<ContextoDeConversacion, 'historial' | 'pasos'> | null> {
  const { rows } = await tx.consultar<{
    nombre: string;
    zona_horaria: string;
    direccion: string | null;
    ciudad: string | null;
    anticipacion_max_dias: number;
    horas_limite_cancelacion: number;
    cliente_nombre: string | null;
  }>(
    `SELECT n.nombre, n.zona_horaria, s.direccion, s.ciudad,
            cf.anticipacion_max_dias, cf.horas_limite_cancelacion, cl.nombre AS cliente_nombre
       FROM conversaciones c
       JOIN negocios n ON n.id = c.negocio_id
       JOIN configuracion_negocio cf ON cf.negocio_id = c.negocio_id
       JOIN clientes cl ON cl.id = c.cliente_id
       LEFT JOIN LATERAL (
         SELECT direccion, ciudad FROM sedes WHERE activa ORDER BY created_at, id LIMIT 1
       ) s ON true
      WHERE c.id = $1`,
    [conversacionId],
  );
  const f = rows[0];
  if (!f) return null;
  return {
    negocio: {
      nombre: f.nombre,
      zonaHoraria: f.zona_horaria,
      direccion: f.direccion,
      ciudad: f.ciudad,
      anticipacionMaxDias: f.anticipacion_max_dias,
      horasLimiteCancelacion: f.horas_limite_cancelacion,
    },
    nombreCliente: f.cliente_nombre,
  };
}

/**
 * Los últimos `limite` mensajes, del más viejo al más nuevo. Sin los del sistema (aviso de datos,
 * avisos de derivación) y sin los salientes que no llegaron: la persona nunca los leyó.
 */
export async function historial(tx: Transaccion, conversacionId: string, limite: number): Promise<MensajeDelHistorial[]> {
  const { rows } = await tx.consultar<{
    emisor: string;
    tipo: MensajeDelHistorial['tipo'];
    contenido: string | null;
    creado_en: Date;
  }>(
    `SELECT emisor, tipo, contenido, creado_en FROM (
       SELECT emisor, tipo, contenido, creado_en, id
         FROM mensajes
        WHERE conversacion_id = $1
          AND emisor <> 'sistema'
          AND (direccion = 'entrante' OR estado_entrega IN ('enviado', 'entregado', 'leido'))
        ORDER BY creado_en DESC, id DESC
        LIMIT $2
     ) ultimos
     ORDER BY creado_en, id`,
    [conversacionId, limite],
  );
  return rows.map((f) => ({
    autor: f.emisor === 'cliente' ? 'cliente' : 'negocio',
    tipo: f.tipo,
    contenido: f.contenido,
    creadoEn: f.creado_en,
  }));
}

/** Las últimas `limite` funciones desde `desde`, en el orden en que ocurrieron. */
export async function pasosDesde(tx: Transaccion, conversacionId: string, desde: Date, limite: number): Promise<PasoDeIA[]> {
  const { rows } = await tx.consultar<{
    call_id: string;
    nombre: string;
    argumentos: string;
    resultado: string;
    creado_en: Date;
    orden: number;
  }>(
    `SELECT call_id, nombre, argumentos, resultado, creado_en, orden FROM (
       SELECT call_id, nombre, argumentos, resultado, creado_en, orden
         FROM ia_pasos
        WHERE conversacion_id = $1 AND creado_en >= $2
        ORDER BY creado_en DESC, orden DESC
        LIMIT $3
     ) ultimos
     ORDER BY creado_en, orden`,
    [conversacionId, desde, limite],
  );
  return rows.map((f) => ({
    callId: f.call_id,
    nombre: f.nombre,
    argumentos: f.argumentos,
    resultado: f.resultado,
    creadoEn: f.creado_en,
    orden: f.orden,
  }));
}

export async function guardarPasos(
  tx: Transaccion,
  negocioId: string,
  conversacionId: string,
  pasos: Omit<PasoDeIA, 'creadoEn' | 'orden'>[],
  creadoEn: Date,
): Promise<void> {
  for (const [orden, p] of pasos.entries()) {
    await tx.consultar(
      `INSERT INTO ia_pasos (negocio_id, conversacion_id, call_id, nombre, argumentos, resultado, orden, creado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [negocioId, conversacionId, p.callId, p.nombre, p.argumentos, p.resultado, orden, creadoEn],
    );
  }
}

/**
 * La conversación pasa a una persona: queda la derivación con su motivo y la IA calla
 * (`estado = 'humano'`). Se limpia lo pendiente para que el procesador no la vuelva a tomar.
 */
export async function derivar(
  tx: Transaccion,
  d: { negocioId: string; conversacionId: string; motivo: MotivoDerivacion; detalle: string | null; ahora: Date },
): Promise<void> {
  await tx.consultar(
    'INSERT INTO derivaciones (negocio_id, conversacion_id, motivo, detalle) VALUES ($1, $2, $3, $4)',
    [d.negocioId, d.conversacionId, d.motivo, d.detalle],
  );
  await tx.consultar(
    `UPDATE conversaciones
        SET estado = 'humano', humano_desde = $2,
            ia_pendiente_desde = NULL, ia_pendiente_en = NULL,
            ia_procesando_hasta = NULL, ia_intentos = 0, ia_reintentar_en = NULL
      WHERE id = $1`,
    [d.conversacionId, d.ahora],
  );
}
