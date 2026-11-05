import { createHash } from 'node:crypto';
import { isIPv6 } from 'node:net';
import { DemasiadosIntentos } from '../../compartido/errores.js';
import { conSistema } from '../../db/contexto.js';
import * as repositorio from './auth.repositorio.js';

/**
 * Límite de intentos de login, por ventanas fijas de 15 minutos. Hay tres contadores:
 *  - Cuenta e IP: frena a quien prueba contraseñas de una cuenta. Es el más bajo, y como depende
 *    de la IP, un atacante no le cierra la cuenta a su dueño desde otro lugar.
 *  - Cuenta: frena un ataque repartido entre muchas IP.
 *  - IP: frena a quien prueba una misma contraseña contra muchas cuentas.
 */
const VENTANA_MS = 15 * 60_000;
const MAX_CUENTA_E_IP = 5;
const MAX_CUENTA = 20;
const MAX_IP = 30;

const sha256 = (texto: string) => createHash('sha256').update(texto).digest('hex');

/**
 * La IP con la que se cuenta. En IPv6 se usa la red /64: cada conexión suele controlar una red
 * entera, y contar direcciones sueltas le daría intentos casi ilimitados.
 */
export function redDeLaIp(ip: string): string {
  const sinZona = ip.split('%')[0]!;
  const mapeada = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(sinZona);
  if (mapeada) return mapeada[1]!;
  if (!isIPv6(sinZona)) return sinZona;

  const [izquierda = '', derecha] = sinZona.split('::');
  const inicio = izquierda ? izquierda.split(':') : [];
  const fin = derecha ? derecha.split(':') : [];
  const grupos = derecha === undefined ? inicio : [...inicio, ...Array<string>(8 - inicio.length - fin.length).fill('0'), ...fin];
  return `${grupos.slice(0, 4).map((grupo) => parseInt(grupo, 16).toString(16)).join(':')}::/64`;
}

function clavesDelIntento(email: string, ip: string | null) {
  const correo = email.trim().toLowerCase();
  const cuenta = { clave: sha256(`cuenta:${correo}`), maximo: MAX_CUENTA };
  if (ip === null) return { cuentaEIp: null, todas: [cuenta] };
  const red = redDeLaIp(ip);
  const cuentaEIp = { clave: sha256(`cuenta-ip:${correo}|${red}`), maximo: MAX_CUENTA_E_IP };
  return { cuentaEIp, todas: [cuentaEIp, cuenta, { clave: sha256(`ip:${red}`), maximo: MAX_IP }] };
}

/**
 * Cuenta el intento ANTES de verificar la contraseña, para que muchas peticiones simultáneas no
 * pasen todas la revisión. Si algún contador está lleno no suma en ninguno: de lo contrario,
 * insistir desde una IP ya frenada acabaría cerrándole la cuenta a su dueño en todas partes.
 */
export async function reservarIntento(email: string, ip: string | null, ahora: Date): Promise<void> {
  const { todas } = clavesDelIntento(email, ip);
  const maximos = new Map(todas.map(({ clave, maximo }) => [clave, maximo]));
  await conSistema(async (tx) => {
    const filas = await repositorio.abrirVentanasDeIntentos(tx, [...maximos.keys()], ahora, new Date(ahora.getTime() - VENTANA_MS));
    const llenas = filas.filter((fila) => fila.intentos >= maximos.get(fila.clave)!);
    if (llenas.length > 0) {
      const finDeVentana = Math.max(...llenas.map((fila) => fila.ventanaInicio.getTime() + VENTANA_MS));
      throw new DemasiadosIntentos(Math.ceil((finDeVentana - ahora.getTime()) / 1000));
    }
    await repositorio.sumarIntento(tx, [...maximos.keys()]);
  });
}

/**
 * Tras un login correcto se devuelve el intento reservado y se reinicia solo el contador de esa
 * cuenta e IP. Los otros no se reinician: si no, un atacante los limpiaría entrando a su propia cuenta.
 */
export async function liberarIntento(email: string, ip: string | null): Promise<void> {
  const { cuentaEIp, todas } = clavesDelIntento(email, ip);
  await conSistema((tx) => repositorio.devolverIntento(tx, todas.map(({ clave }) => clave), cuentaEIp?.clave ?? null));
}
