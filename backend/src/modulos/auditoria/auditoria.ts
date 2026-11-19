import { isIPv6 } from 'node:net';
import { errorParaLog, logger } from '../../compartido/logger.js';
import { conSistema, type Transaccion } from '../../db/contexto.js';
import { redDeLaIp } from '../auth/auth.intentos.js';

/**
 * Registro de auditoría (tabla `auditoria`, migración 018): quién hizo qué y cuándo. Solo ids y
 * valores cortos: nunca contraseñas, tokens, correos ni teléfonos.
 */

export type AccionAuditada =
  | 'login_correcto'
  | 'login_fallido'
  | 'cerrar_sesion'
  | 'cerrar_otras_sesiones'
  | 'cambiar_contrasena'
  | 'restablecer_contrasena'
  | 'aceptar_invitacion'
  | 'invitar_usuario'
  | 'reenviar_invitacion'
  | 'generar_recuperacion'
  | 'desactivar_usuario'
  | 'crear_negocio'
  | 'cambiar_plan_estado'
  | 'registrar_whatsapp'
  | 'cambiar_whatsapp';

/** Solo valores simples: así no se cuela por error un objeto con un token o un teléfono adentro. */
export type DetalleAuditoria = Record<string, string | number | boolean | null>;

export interface EventoAuditoria {
  accion: AccionAuditada;
  usuarioId?: string | null;
  negocioId?: string | null;
  ip?: string | null;
  detalle?: DetalleAuditoria;
}

/** La red de la IP: /24 en IPv4 y /48 en IPv6. Basta para ver de dónde viene algo sin guardar la dirección exacta. */
export function ipParaAuditoria(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const red = redDeLaIp(ip);
  if (red.endsWith('::/64')) return `${red.slice(0, -'::/64'.length).split(':').slice(0, 3).join(':')}::/48`;
  if (isIPv6(red)) return null;
  const partes = red.split('.');
  return partes.length === 4 ? `${partes.slice(0, 3).join('.')}.0/24` : null;
}

/** Dentro de la transacción de la acción: si la acción se deshace, el registro también. */
export async function registrar(tx: Transaccion, evento: EventoAuditoria): Promise<void> {
  await tx.consultar(
    `INSERT INTO auditoria (accion, usuario_id, negocio_id, ip_red, detalle) VALUES ($1, $2, $3, $4, $5)`,
    [evento.accion, evento.usuarioId ?? null, evento.negocioId ?? null, ipParaAuditoria(evento.ip), JSON.stringify(evento.detalle ?? {})],
  );
}

/**
 * En su propia transacción. Para lo que pasa aunque la acción falle (un login fallido) y para lo
 * que se anota después de responder. Nunca lanza: si no se puede anotar, queda en el log, pero
 * la persona no se queda sin respuesta.
 */
export async function registrarAparte(evento: EventoAuditoria): Promise<void> {
  try {
    await conSistema((tx) => registrar(tx, evento));
  } catch (error) {
    logger.error({ err: errorParaLog(error), accion: evento.accion }, 'No se pudo anotar en la auditoría');
  }
}
