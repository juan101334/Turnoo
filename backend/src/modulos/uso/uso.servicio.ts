import { NoEncontrado } from '../../compartido/errores.js';
import { primerDiaDelMes } from '../../compartido/tiempo.js';
import { esUuid } from '../../compartido/validacion.js';
import { conNegocio } from '../../db/contexto.js';
import * as repositorio from './uso.repositorio.js';

/**
 * Contadores del plan en `uso_mensual`, por negocio y por mes local del negocio.
 *
 * Una conversación de IA cuenta UNA vez por mes, la primera vez que la IA la atiende ese mes.
 * Cuando el plan llega al límite, las conversaciones ya contadas siguen atendiéndose (no se le
 * corta la conversación a nadie a mitad de camino); las nuevas no pasan por la IA.
 */

export type CupoDeIA = 'ya_contada' | 'contada' | 'sin_cupo';

export async function reservarConversacionIA(
  negocioId: string,
  conversacionId: string,
  zonaHoraria: string,
  ahora: Date,
): Promise<CupoDeIA> {
  if (!esUuid(conversacionId)) throw new NoEncontrado('La conversación');
  const periodo = primerDiaDelMes(ahora, zonaHoraria);
  return conNegocio(negocioId, async (tx) => {
    const contada = await repositorio.periodoContado(tx, conversacionId);
    if (contada === undefined) throw new NoEncontrado('La conversación');
    if (contada === periodo) return 'ya_contada';
    const limite = await repositorio.limiteConversacionesIA(tx, negocioId);
    if (!(await repositorio.sumarConversacionIA(tx, negocioId, periodo, limite))) return 'sin_cupo';
    await repositorio.marcarContada(tx, conversacionId, periodo);
    return 'contada';
  });
}

/** Suma los tokens de una atención, aunque haya fallado: se gastaron igual. */
export async function registrarTokens(
  negocioId: string,
  zonaHoraria: string,
  ahora: Date,
  tokens: { entrada: number; salida: number },
): Promise<void> {
  if (tokens.entrada <= 0 && tokens.salida <= 0) return;
  const periodo = primerDiaDelMes(ahora, zonaHoraria);
  await conNegocio(negocioId, (tx) => repositorio.sumarTokens(tx, negocioId, periodo, tokens.entrada, tokens.salida));
}
