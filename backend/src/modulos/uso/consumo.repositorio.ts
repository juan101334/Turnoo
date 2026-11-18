import type { Transaccion } from '../../db/contexto.js';

/**
 * Único lugar con SQL del panel de consumo del superadmin. Todo son agregados (conteos y sumas):
 * ninguna consulta devuelve el texto de un mensaje, un teléfono ni el nombre de un cliente.
 *
 * `periodo` es el primer día del mes ('AAAA-MM-01'). Cada negocio vive en su zona horaria: su mes
 * va de la medianoche local del día 1 a la del día 1 siguiente.
 */

export type EstadoNegocio = 'prueba' | 'activo' | 'suspendido';

export interface UsoDeNegocio {
  negocioId: string;
  nombre: string;
  estado: EstadoNegocio;
  pruebaHasta: Date | null;
  plan: { nombre: string; precioMensualCop: number; maxConversacionesIa: number | null } | null;
  conversacionesIa: number;
  plantillas: number;
  /**
   * Mensajes de servicio del mes por cada número de WhatsApp del negocio: los de texto libre que
   * salieron por la API (asistente, panel y sistema) y que Meta aceptó. Los fallidos no cuentan.
   * Un número por posición; los que no enviaron nada no aparecen.
   */
  mensajesServicioPorNumero: number[];
  segundosAudio: number;
  tokensEntrada: number;
  tokensSalida: number;
  /** Citas cuyo inicio cae en el mes, por estado. */
  citas: { porAprobar: number; pendientes: number; confirmadas: number; completadas: number; canceladas: number; noAsistio: number };
  canceladasPor: { cliente: number; negocio: number; sistema: number };
  derivaciones: number;
  fallos: { recordatorios: number; avisos: number; mensajes: number };
  /** Último mensaje de un cliente o última cita creada; null si nunca hubo. */
  ultimaActividad: Date | null;
}

interface FilaUso {
  id: string;
  nombre: string;
  estado: EstadoNegocio;
  prueba_hasta: Date | null;
  plan: string | null;
  precio_mensual_cop: number | null;
  max_conversaciones_ia_mes: number | null;
  conversaciones_ia: number;
  plantillas: number;
  servicio_por_numero: number[];
  segundos_audio: number;
  tokens_entrada: string;
  tokens_salida: string;
  por_aprobar: number;
  pendientes: number;
  confirmadas: number;
  completadas: number;
  canceladas: number;
  no_asistio: number;
  canceladas_cliente: number;
  canceladas_negocio: number;
  canceladas_sistema: number;
  recordatorios_fallidos: number;
  derivaciones: number;
  avisos_fallidos: number;
  mensajes_fallidos: number;
  ultima_actividad: Date | null;
}

/** Uso del mes de cada negocio (o de uno solo), por nombre. Los totales salen de `uso_mensual`. */
export async function usoPorNegocio(tx: Transaccion, periodo: string, negocioId: string | null = null): Promise<UsoDeNegocio[]> {
  const { rows } = await tx.consultar<FilaUso>(
    `SELECT n.id, n.nombre, n.estado, n.prueba_hasta,
            p.nombre AS plan, p.precio_mensual_cop, p.max_conversaciones_ia_mes,
            COALESCE(u.conversaciones_ia, 0) AS conversaciones_ia,
            COALESCE(u.plantillas_enviadas, 0) AS plantillas,
            COALESCE(u.segundos_audio_transcritos, 0) AS segundos_audio,
            COALESCE(u.tokens_entrada, 0) AS tokens_entrada,
            COALESCE(u.tokens_salida, 0) AS tokens_salida,
            c.por_aprobar, c.pendientes, c.confirmadas, c.completadas, c.canceladas, c.no_asistio,
            c.canceladas_cliente, c.canceladas_negocio, c.canceladas_sistema, c.recordatorios_fallidos,
            d.derivaciones, d.avisos_fallidos, m.mensajes_fallidos, s.servicio_por_numero,
            GREATEST(
              (SELECT max(ultimo_mensaje_cliente_en) FROM conversaciones WHERE negocio_id = n.id),
              (SELECT max(created_at) FROM citas WHERE negocio_id = n.id)
            ) AS ultima_actividad
       FROM negocios n
       LEFT JOIN planes p ON p.id = n.plan_id
       LEFT JOIN uso_mensual u ON u.negocio_id = n.id AND u.periodo = $1::date
      CROSS JOIN LATERAL (
        SELECT $1::date::timestamp AT TIME ZONE n.zona_horaria AS desde,
               ($1::date + interval '1 month') AT TIME ZONE n.zona_horaria AS hasta
      ) mes
      CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE estado = 'por_aprobar')::int AS por_aprobar,
               count(*) FILTER (WHERE estado = 'pendiente')::int   AS pendientes,
               count(*) FILTER (WHERE estado = 'confirmada')::int  AS confirmadas,
               count(*) FILTER (WHERE estado = 'completada')::int  AS completadas,
               count(*) FILTER (WHERE estado = 'cancelada')::int   AS canceladas,
               count(*) FILTER (WHERE estado = 'no_asistio')::int  AS no_asistio,
               count(*) FILTER (WHERE cancelada_por = 'cliente')::int AS canceladas_cliente,
               count(*) FILTER (WHERE cancelada_por = 'negocio')::int AS canceladas_negocio,
               count(*) FILTER (WHERE cancelada_por = 'sistema')::int AS canceladas_sistema,
               count(*) FILTER (WHERE recordatorio_resultado = 'fallido')::int AS recordatorios_fallidos
          FROM citas
         WHERE negocio_id = n.id AND inicio >= mes.desde AND inicio < mes.hasta
      ) c
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS derivaciones,
               count(*) FILTER (WHERE aviso_resultado = 'fallido')::int AS avisos_fallidos
          FROM derivaciones
         WHERE negocio_id = n.id AND created_at >= mes.desde AND created_at < mes.hasta
      ) d
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS mensajes_fallidos
          FROM mensajes
         WHERE negocio_id = n.id AND direccion = 'saliente' AND estado_entrega = 'fallido'
           AND creado_en >= mes.desde AND creado_en < mes.hasta
      ) m
      -- Mensajes de servicio por número (la conversación dice de qué número salió). Meta da los
      -- gratis por número, así que no se suman antes de separar los gratis.
      CROSS JOIN LATERAL (
        SELECT COALESCE(array_agg(por_numero.cantidad ORDER BY por_numero.cantidad DESC), '{}') AS servicio_por_numero
          FROM (
            SELECT count(*)::int AS cantidad
              FROM mensajes me
              JOIN conversaciones co ON co.negocio_id = me.negocio_id AND co.id = me.conversacion_id
             WHERE me.negocio_id = n.id AND me.direccion = 'saliente' AND me.tipo = 'texto'
               AND me.estado_entrega IN ('enviado', 'entregado', 'leido')
               AND me.creado_en >= mes.desde AND me.creado_en < mes.hasta
             GROUP BY co.whatsapp_cuenta_id
          ) por_numero
      ) s
      WHERE $2::uuid IS NULL OR n.id = $2::uuid
      ORDER BY lower(n.nombre), n.id`,
    [periodo, negocioId],
  );
  return rows.map((f) => ({
    negocioId: f.id,
    nombre: f.nombre,
    estado: f.estado,
    pruebaHasta: f.prueba_hasta,
    plan:
      f.plan === null || f.precio_mensual_cop === null
        ? null
        : { nombre: f.plan, precioMensualCop: f.precio_mensual_cop, maxConversacionesIa: f.max_conversaciones_ia_mes },
    conversacionesIa: f.conversaciones_ia,
    plantillas: f.plantillas,
    mensajesServicioPorNumero: f.servicio_por_numero,
    segundosAudio: f.segundos_audio,
    // bigint llega como texto. Los tokens de un mes caben de sobra en un número de JavaScript.
    tokensEntrada: Number(f.tokens_entrada),
    tokensSalida: Number(f.tokens_salida),
    citas: {
      porAprobar: f.por_aprobar,
      pendientes: f.pendientes,
      confirmadas: f.confirmadas,
      completadas: f.completadas,
      canceladas: f.canceladas,
      noAsistio: f.no_asistio,
    },
    canceladasPor: { cliente: f.canceladas_cliente, negocio: f.canceladas_negocio, sistema: f.canceladas_sistema },
    derivaciones: f.derivaciones,
    fallos: { recordatorios: f.recordatorios_fallidos, avisos: f.avisos_fallidos, mensajes: f.mensajes_fallidos },
    ultimaActividad: f.ultima_actividad,
  }));
}

/** Derivaciones a una persona creadas en el mes, por motivo. Solo el motivo: nunca el detalle. */
export async function derivacionesPorMotivo(tx: Transaccion, periodo: string, negocioId: string): Promise<{ motivo: string; cantidad: number }[]> {
  const { rows } = await tx.consultar<{ motivo: string; cantidad: number }>(
    `SELECT d.motivo, count(*)::int AS cantidad
       FROM derivaciones d
       JOIN negocios n ON n.id = d.negocio_id
      WHERE d.negocio_id = $2
        AND d.created_at >= $1::date::timestamp AT TIME ZONE n.zona_horaria
        AND d.created_at <  ($1::date + interval '1 month') AT TIME ZONE n.zona_horaria
      GROUP BY d.motivo
      ORDER BY cantidad DESC, d.motivo`,
    [periodo, negocioId],
  );
  return rows;
}

export interface UsoDelDia {
  /** Día local del negocio, 'AAAA-MM-DD'. */
  fecha: string;
  atencionesIa: number;
  plantillas: number;
  segundosAudio: number;
  citasCreadas: number;
}

/**
 * Uso por día del mes, de todos los negocios o de uno. Solo trae los días con algo. La IA, las
 * plantillas y el audio salen de `consumos`: de antes de esa tabla no hay detalle por día.
 */
export async function usoPorDia(tx: Transaccion, periodo: string, negocioId: string | null = null): Promise<UsoDelDia[]> {
  const { rows } = await tx.consultar<{ fecha: string; atenciones_ia: number; plantillas: number; segundos_audio: number; citas_creadas: number }>(
    `SELECT to_char(dia, 'YYYY-MM-DD') AS fecha,
            sum(ia)::int AS atenciones_ia, sum(plantilla)::int AS plantillas,
            sum(audio)::int AS segundos_audio, sum(cita)::int AS citas_creadas
       FROM (
         SELECT (c.creado_en AT TIME ZONE n.zona_horaria)::date AS dia,
                (c.tipo = 'ia_texto')::int AS ia, (c.tipo = 'plantilla')::int AS plantilla,
                COALESCE(c.segundos_audio, 0) AS audio, 0 AS cita
           FROM consumos c JOIN negocios n ON n.id = c.negocio_id
          WHERE $2::uuid IS NULL OR c.negocio_id = $2::uuid
         UNION ALL
         SELECT (c.created_at AT TIME ZONE n.zona_horaria)::date, 0, 0, 0, 1
           FROM citas c JOIN negocios n ON n.id = c.negocio_id
          WHERE $2::uuid IS NULL OR c.negocio_id = $2::uuid
       ) x
      WHERE dia >= $1::date AND dia < $1::date + interval '1 month'
      GROUP BY dia
      ORDER BY dia`,
    [periodo, negocioId],
  );
  return rows.map((f) => ({
    fecha: f.fecha,
    atencionesIa: f.atenciones_ia,
    plantillas: f.plantillas,
    segundosAudio: f.segundos_audio,
    citasCreadas: f.citas_creadas,
  }));
}

/** Día del primer registro de `consumos` ('AAAA-MM-DD'); null si aún no hay ninguno. */
export async function primerDiaConDetalle(tx: Transaccion): Promise<string | null> {
  const { rows } = await tx.consultar<{ fecha: string | null }>(
    `SELECT to_char(min((c.creado_en AT TIME ZONE n.zona_horaria)::date), 'YYYY-MM-DD') AS fecha
       FROM consumos c JOIN negocios n ON n.id = c.negocio_id`,
  );
  return rows[0]?.fecha ?? null;
}

export interface NegocioParaAlertas {
  negocioId: string;
  nombre: string;
  estado: EstadoNegocio;
  pruebaHasta: Date | null;
  creadoEn: Date;
  plan: string | null;
  limiteConversacionesIa: number | null;
  /** Conversaciones de IA del mes en curso del negocio. */
  conversacionesIa: number;
  ultimaCitaCreada: Date | null;
}

/** Lo que hace falta para las alertas, de los negocios que no están suspendidos. Siempre sobre hoy. */
export async function negociosParaAlertas(tx: Transaccion, ahora: Date): Promise<NegocioParaAlertas[]> {
  const { rows } = await tx.consultar<{
    id: string;
    nombre: string;
    estado: EstadoNegocio;
    prueba_hasta: Date | null;
    created_at: Date;
    plan: string | null;
    limite: number | null;
    usadas: number;
    ultima_cita: Date | null;
  }>(
    `SELECT n.id, n.nombre, n.estado, n.prueba_hasta, n.created_at,
            p.nombre AS plan, p.max_conversaciones_ia_mes AS limite,
            COALESCE(u.conversaciones_ia, 0) AS usadas,
            (SELECT max(created_at) FROM citas WHERE negocio_id = n.id) AS ultima_cita
       FROM negocios n
       LEFT JOIN planes p ON p.id = n.plan_id
       LEFT JOIN uso_mensual u ON u.negocio_id = n.id
        AND u.periodo = (date_trunc('month', $1::timestamptz AT TIME ZONE n.zona_horaria))::date
      WHERE n.estado <> 'suspendido'
      ORDER BY lower(n.nombre), n.id`,
    [ahora],
  );
  return rows.map((f) => ({
    negocioId: f.id,
    nombre: f.nombre,
    estado: f.estado,
    pruebaHasta: f.prueba_hasta,
    creadoEn: f.created_at,
    plan: f.plan,
    limiteConversacionesIa: f.limite,
    conversacionesIa: f.usadas,
    ultimaCitaCreada: f.ultima_cita,
  }));
}
