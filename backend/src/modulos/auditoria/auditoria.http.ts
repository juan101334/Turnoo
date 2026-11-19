import type { Request } from 'express';
import { usuarioDe } from '../auth/auth.middleware.js';
import { registrarAparte, type AccionAuditada, type DetalleAuditoria } from './auditoria.js';

/**
 * Anota una acción de quien tiene la sesión, con la IP de la petición. Va en las rutas, después
 * de que la acción salió bien. `negocioId`: el negocio afectado, si no es el de la sesión (el
 * superadmin actúa sobre otros). Aparte de auditoria.ts para no cruzar imports con auth.servicio.
 */
export function auditar(req: Request, accion: AccionAuditada, extra: { negocioId?: string | null; detalle?: DetalleAuditoria } = {}) {
  const usuario = usuarioDe(req);
  return registrarAparte({
    accion,
    usuarioId: usuario.usuarioId,
    negocioId: extra.negocioId === undefined ? usuario.negocioId : extra.negocioId,
    ip: req.ip ?? null,
    ...(extra.detalle && { detalle: extra.detalle }),
  });
}
