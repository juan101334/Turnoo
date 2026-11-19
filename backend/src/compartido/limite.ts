import type { Request, RequestHandler } from 'express';
import { DemasiadasPeticiones } from './errores.js';
import { redDeLaIp } from '../modulos/auth/auth.intentos.js';

/**
 * Límite de peticiones por ventanas fijas, en memoria. La API corre en un solo proceso, así que
 * no hace falta una base compartida; al reiniciar, los contadores empiezan de cero (aceptable:
 * el límite del login, que es el que más importa, vive en la base y sobrevive).
 *
 * No reemplaza al límite de login (auth.intentos.ts): ese cuenta por cuenta y por IP, y sobrevive
 * a un reinicio. Este frena el volumen: un bot que barre la API o que repite un mismo endpoint.
 */

export interface Limite {
  ventanaMs: number;
  maximo: number;
}

/** Cuenta peticiones por clave en ventanas fijas de `ventanaMs`. */
export class ContadorPorVentana {
  private readonly cuentas = new Map<string, { inicio: number; cuenta: number }>();
  private ultimaLimpieza = 0;

  constructor(private readonly limite: Limite) {}

  /** Suma una petición. null si cabe; si no, los segundos que faltan para que se libere. */
  sumar(clave: string, ahora = Date.now()): number | null {
    this.limpiar(ahora);
    let actual = this.cuentas.get(clave);
    if (!actual || ahora - actual.inicio >= this.limite.ventanaMs) {
      actual = { inicio: ahora, cuenta: 0 };
      this.cuentas.set(clave, actual);
    }
    if (actual.cuenta >= this.limite.maximo) {
      return Math.max(1, Math.ceil((actual.inicio + this.limite.ventanaMs - ahora) / 1000));
    }
    actual.cuenta += 1;
    return null;
  }

  /** Una vez por ventana se borran las claves vencidas: así la memoria no crece con cada IP que pasa. */
  private limpiar(ahora: number) {
    if (ahora - this.ultimaLimpieza < this.limite.ventanaMs) return;
    this.ultimaLimpieza = ahora;
    for (const [clave, { inicio }] of this.cuentas) {
      if (ahora - inicio >= this.limite.ventanaMs) this.cuentas.delete(clave);
    }
  }
}

/**
 * Middleware que cuenta con `claveDe`. Una clave null no cuenta (por ejemplo, sin IP conocida).
 * Al pasarse, responde 429 con Retry-After y un mensaje genérico (lo arma manejarErrores).
 */
export function limitar(limite: Limite, claveDe: (req: Request) => string | null): RequestHandler {
  const contador = new ContadorPorVentana(limite);
  return (req, _res, next) => {
    const clave = claveDe(req);
    const espera = clave === null ? null : contador.sumar(clave);
    next(espera === null ? undefined : new DemasiadasPeticiones(espera));
  };
}

/**
 * La IP de la petición (req.ip ya respeta `trust proxy`, es decir, SALTOS_PROXY), con IPv6
 * agrupado en su red /64 como en el límite de login.
 */
export const porIp = (req: Request): string | null => (req.ip ? redDeLaIp(req.ip) : null);
