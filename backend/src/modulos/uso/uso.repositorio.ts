import type { Transaccion } from '../../db/contexto.js';

/** Único lugar con SQL de los contadores de uso del plan. */

/** Período en que ya se contó la conversación, bloqueándola para que dos atenciones no cuenten dos veces. */
export async function periodoContado(tx: Transaccion, conversacionId: string): Promise<string | null | undefined> {
  const { rows } = await tx.consultar<{ periodo: string | null }>(
    `SELECT to_char(ia_contada_periodo, 'YYYY-MM-DD') AS periodo FROM conversaciones WHERE id = $1 FOR UPDATE`,
    [conversacionId],
  );
  return rows[0] ? rows[0].periodo : undefined;
}

/** Conversaciones de IA al mes que permite el plan; null = sin plan o sin límite. */
export async function limiteConversacionesIA(tx: Transaccion, negocioId: string): Promise<number | null> {
  const { rows } = await tx.consultar<{ limite: number | null }>(
    `SELECT p.max_conversaciones_ia_mes AS limite
       FROM negocios n LEFT JOIN planes p ON p.id = n.plan_id
      WHERE n.id = $1`,
    [negocioId],
  );
  return rows[0]?.limite ?? null;
}

/**
 * Suma una conversación de IA al mes, solo si cabe en el límite. Devuelve false si no cabe.
 *
 * Es atómico sin bloquear el negocio: el UPDATE bloquea la fila del mes y, si otra atención la
 * cambió mientras tanto, PostgreSQL vuelve a evaluar la condición con el valor nuevo. Dos
 * conversaciones a la vez con un solo cupo: una entra y la otra no.
 */
export async function sumarConversacionIA(
  tx: Transaccion,
  negocioId: string,
  periodo: string,
  limite: number | null,
): Promise<boolean> {
  await tx.consultar(
    `INSERT INTO uso_mensual (negocio_id, periodo) VALUES ($1, $2::date) ON CONFLICT (negocio_id, periodo) DO NOTHING`,
    [negocioId, periodo],
  );
  const { rowCount } = await tx.consultar(
    `UPDATE uso_mensual SET conversaciones_ia = conversaciones_ia + 1
      WHERE negocio_id = $1 AND periodo = $2::date AND ($3::int IS NULL OR conversaciones_ia < $3::int)`,
    [negocioId, periodo, limite],
  );
  return (rowCount ?? 0) > 0;
}

export async function marcarContada(tx: Transaccion, conversacionId: string, periodo: string): Promise<void> {
  await tx.consultar('UPDATE conversaciones SET ia_contada_periodo = $2::date WHERE id = $1', [conversacionId, periodo]);
}

export async function sumarTokens(
  tx: Transaccion,
  negocioId: string,
  periodo: string,
  entrada: number,
  salida: number,
): Promise<void> {
  await tx.consultar(
    `INSERT INTO uso_mensual (negocio_id, periodo, tokens_entrada, tokens_salida) VALUES ($1, $2::date, $3, $4)
     ON CONFLICT (negocio_id, periodo)
     DO UPDATE SET tokens_entrada = uso_mensual.tokens_entrada + EXCLUDED.tokens_entrada,
                   tokens_salida  = uso_mensual.tokens_salida  + EXCLUDED.tokens_salida`,
    [negocioId, periodo, entrada, salida],
  );
}
