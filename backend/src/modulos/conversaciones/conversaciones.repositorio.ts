import type { Transaccion } from '../../db/contexto.js';
import type {
  ContextoDeConversacion,
  ConversacionDelPanel,
  MensajeDelHistorial,
  MensajeDelPanel,
  MotivoDerivacion,
  PasoDeIA,
} from './conversaciones.tipos.js';

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
    transcripcion: string | null;
    imagen_guardada: boolean;
    adjunto_error: string | null;
    creado_en: Date;
  }>(
    `SELECT emisor, tipo, contenido, transcripcion, imagen_guardada, adjunto_error, creado_en FROM (
       SELECT emisor, tipo, contenido, transcripcion, archivo_ruta IS NOT NULL AS imagen_guardada, adjunto_error, creado_en, id
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
    transcripcion: f.transcripcion,
    imagenGuardada: f.imagen_guardada,
    adjuntoError: f.adjunto_error,
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
    'INSERT INTO derivaciones (negocio_id, conversacion_id, motivo, detalle, created_at) VALUES ($1, $2, $3, $4, $5)',
    [d.negocioId, d.conversacionId, d.motivo, d.detalle, d.ahora],
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

// ---------------------------------------------------------------------
// Panel: el dueño lee y responde las conversaciones
// ---------------------------------------------------------------------

interface FilaConversacionDelPanel {
  id: string;
  estado: ConversacionDelPanel['estado'];
  humano_desde: Date | null;
  ultimo_mensaje_en: Date | null;
  cliente_id: string;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  motivo: MotivoDerivacion | null;
  detalle: string | null;
  derivada_en: Date | null;
}

/** La conversación con su cliente y la derivación más reciente. Se completa con WHERE / ORDER / LIMIT. */
const CONVERSACION_DEL_PANEL_SQL = `
  SELECT c.id, c.estado, c.humano_desde, c.ultimo_mensaje_en,
         cl.id AS cliente_id, cl.nombre AS cliente_nombre, cl.telefono AS cliente_telefono,
         d.motivo, d.detalle, d.created_at AS derivada_en
    FROM conversaciones c
    JOIN clientes cl ON cl.id = c.cliente_id
    LEFT JOIN LATERAL (
      SELECT motivo, detalle, created_at FROM derivaciones WHERE conversacion_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
    ) d ON true`;

function aConversacionDelPanel(f: FilaConversacionDelPanel): ConversacionDelPanel {
  return {
    id: f.id,
    estado: f.estado,
    humanoDesde: f.humano_desde,
    ultimoMensajeEn: f.ultimo_mensaje_en,
    cliente: { id: f.cliente_id, nombre: f.cliente_nombre, telefono: f.cliente_telefono },
    ultimaDerivacion: f.motivo ? { motivo: f.motivo, detalle: f.detalle, creadaEn: f.derivada_en! } : null,
  };
}

export async function listarParaPanel(
  tx: Transaccion,
  estado: 'bot' | 'humano' | null,
  limite: number,
): Promise<ConversacionDelPanel[]> {
  const { rows } = await tx.consultar<FilaConversacionDelPanel>(
    `${CONVERSACION_DEL_PANEL_SQL}
      WHERE ($1::text IS NULL OR c.estado = $1)
      ORDER BY c.ultimo_mensaje_en DESC NULLS LAST, c.id
      LIMIT $2`,
    [estado, limite],
  );
  return rows.map(aConversacionDelPanel);
}

export async function obtenerParaPanel(tx: Transaccion, conversacionId: string): Promise<ConversacionDelPanel | null> {
  const { rows } = await tx.consultar<FilaConversacionDelPanel>(`${CONVERSACION_DEL_PANEL_SQL} WHERE c.id = $1`, [conversacionId]);
  return rows[0] ? aConversacionDelPanel(rows[0]) : null;
}

/** Los últimos `limite` mensajes, del más viejo al más nuevo. */
export async function mensajesParaPanel(tx: Transaccion, conversacionId: string, limite: number): Promise<MensajeDelPanel[]> {
  const { rows } = await tx.consultar<{
    id: string;
    direccion: MensajeDelPanel['direccion'];
    emisor: MensajeDelPanel['emisor'];
    tipo: MensajeDelPanel['tipo'];
    contenido: string | null;
    transcripcion: string | null;
    tiene_imagen: boolean;
    estado_entrega: string | null;
    creado_en: Date;
  }>(
    `SELECT * FROM (
       SELECT id, direccion, emisor, tipo, contenido, transcripcion, archivo_ruta IS NOT NULL AS tiene_imagen, estado_entrega, creado_en
         FROM mensajes WHERE conversacion_id = $1
        ORDER BY creado_en DESC, id DESC
        LIMIT $2
     ) ultimos ORDER BY creado_en, id`,
    [conversacionId, limite],
  );
  return rows.map((f) => ({
    id: f.id,
    direccion: f.direccion,
    emisor: f.emisor,
    tipo: f.tipo,
    contenido: f.contenido,
    transcripcion: f.transcripcion,
    tieneImagen: f.tiene_imagen,
    estadoEntrega: f.estado_entrega,
    creadoEn: f.creado_en,
  }));
}

/**
 * Una persona del negocio toma la conversación: la IA calla y el plazo del modo humano empieza
 * de nuevo, para que la IA no vuelva mientras la persona está respondiendo.
 */
export async function tomarConversacion(tx: Transaccion, conversacionId: string, ahora: Date): Promise<boolean> {
  const { rowCount } = await tx.consultar(
    `UPDATE conversaciones
        SET estado = 'humano', humano_desde = $2,
            ia_pendiente_desde = NULL, ia_pendiente_en = NULL, ia_intentos = 0, ia_reintentar_en = NULL
      WHERE id = $1 AND estado <> 'cerrada'`,
    [conversacionId, ahora],
  );
  return (rowCount ?? 0) > 0;
}
