import pino, { type LoggerOptions } from 'pino';
import { entorno } from '../config/entorno.js';

/**
 * Registro de eventos. Reglas: nunca registrar el contenido de los mensajes
 * ni teléfonos completos. Lo sensible se oculta solo, aunque alguien lo pase
 * por error:
 *  - Por nombre de campo, hasta tres niveles de profundidad: contraseñas,
 *    tokens, cookies y cabeceras de autorización se cambian por "[oculto]";
 *    los teléfonos quedan con sus 4 últimos dígitos.
 *  - Dentro de cualquier texto (por ejemplo, el error que devuelve Meta), un
 *    número de 10 a 15 dígitos se enmascara igual que un teléfono.
 */

const OCULTO = '[oculto]';

/** Se reemplazan por "[oculto]". */
const CAMPOS_SECRETOS = [
  'password',
  'passwordHash',
  'password_hash',
  'contrasena',
  'actual',
  'nueva',
  'token',
  'tokenSesion',
  'tokenAcceso',
  'token_acceso_cifrado',
  'accessToken',
  'access_token',
  'apiKey',
  'secreto',
  'authorization',
  'cookie',
];

/** Se enmascaran: quedan los 4 últimos dígitos. */
const CAMPOS_TELEFONO = ['telefono', 'telefonoAvisos', 'waUserId', 'wa_id'];

/** "+573001234567" → "***4567". Lo que no sea texto o número, oculto entero. */
export function enmascararTelefono(valor: unknown): string {
  if (typeof valor !== 'string' && typeof valor !== 'number') return OCULTO;
  // formatters.log corre antes que redact: un teléfono dentro de un texto ya llega enmascarado.
  if (typeof valor === 'string' && /^\*\*\*\d{4}$/.test(valor)) return valor;
  const digitos = String(valor).replace(/\D/g, '');
  return digitos.length > 4 ? `***${digitos.slice(-4)}` : OCULTO;
}

const conProfundidad = (campo: string) => [campo, `*.${campo}`, `*.*.${campo}`];

const RUTAS_OCULTAS = [
  ...[...CAMPOS_SECRETOS, ...CAMPOS_TELEFONO].flatMap(conProfundidad),
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  '*.headers["set-cookie"]',
  '*.headers["x-hub-signature-256"]',
];

// Un número largo suelto (no pegado a letras ni guiones: así no toca un uuid).
const NUMERO_LARGO = /(?<![\w-])\+?\d{10,15}(?![\w-])/g;

/** Enmascara números largos en los textos, sin tocar los campos que son ids (phoneNumberId, mensajeId). */
function limpiarTextos(valor: unknown, campo: string, nivel: number): unknown {
  if (typeof valor === 'string') return /id$/i.test(campo) ? valor : valor.replace(NUMERO_LARGO, (n) => enmascararTelefono(n));
  if (nivel >= 3 || valor === null || typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) return valor.map((v) => limpiarTextos(v, campo, nivel + 1));
  // Solo objetos planos: un Error perdería message y stack, y un Buffer se desarmaría byte a byte.
  const prototipo = Object.getPrototypeOf(valor) as unknown;
  if (prototipo !== Object.prototype && prototipo !== null) return valor;
  return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, limpiarTextos(v, k, nivel + 1)]));
}

/** Opciones compartidas por el logger de la app y por la prueba que las revisa. */
export const OPCIONES_DE_REGISTRO: Pick<LoggerOptions, 'redact' | 'formatters'> = {
  redact: {
    paths: RUTAS_OCULTAS,
    censor: (valor: unknown, ruta: string[]) => (CAMPOS_TELEFONO.includes(ruta.at(-1) ?? '') ? enmascararTelefono(valor) : OCULTO),
  },
  formatters: {
    log: (objeto) => limpiarTextos(objeto, '', 0) as Record<string, unknown>,
  },
};

export const logger = pino({
  level: entorno.LOG_LEVEL,
  ...OPCIONES_DE_REGISTRO,
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
