import { z, type ZodType } from 'zod';
import { DatosInvalidos } from './errores.js';

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿Es un uuid con formato válido? Evita que PostgreSQL falle por un id mal escrito. */
export function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && FORMATO_UUID.test(valor);
}

/** Fecha y hora ISO con zona en la entrada; `Date` ya convertido en la salida. */
export const instanteIso = z.iso
  .datetime({ offset: true, message: 'Debe ser fecha y hora ISO con zona, ej. 2030-06-10T09:00:00-05:00' })
  .transform((texto) => new Date(texto));

/** Valida `datos` con un esquema de zod; si no cumple, lanza DatosInvalidos con el primer problema. */
export function validarEsquema<T>(esquema: ZodType<T>, datos: unknown): T {
  const resultado = esquema.safeParse(datos);
  if (!resultado.success) {
    const problema = resultado.error.issues[0];
    const campo = problema?.path.join('.');
    throw new DatosInvalidos(campo ? `${campo}: ${problema?.message}` : problema?.message);
  }
  return resultado.data;
}
