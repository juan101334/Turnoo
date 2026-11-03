import type { ZodType } from 'zod';
import { DatosInvalidos } from './errores.js';

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿Es un uuid con formato válido? Evita que PostgreSQL falle por un id mal escrito. */
export function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && FORMATO_UUID.test(valor);
}

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
