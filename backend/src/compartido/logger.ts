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
