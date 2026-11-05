import pino from 'pino';
import { entorno } from '../config/entorno.js';

/**
 * Registro de eventos. Reglas: nunca registrar el contenido de los mensajes
 * ni teléfonos completos. Los campos sensibles más comunes se ocultan solos.
 */
export const logger = pino({
  level: entorno.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.telefono',
      '*.waUserId',
    ],
    censor: '[oculto]',
  },
  ...(entorno.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
        },
      }
    : {}),
});

/**
 * Lo que se registra de un error cuando puede venir de datos de personas: el `detail` de PostgreSQL
 * puede traer el contenido de la fila, por eso no se incluye.
 */
export function errorParaLog(error: unknown) {
  const { message, code, stack } = error as { message?: string; code?: string; stack?: string };
  return { mensaje: message, codigo: code, stack };
}
