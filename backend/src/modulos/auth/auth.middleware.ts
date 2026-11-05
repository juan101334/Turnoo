import type { NextFunction, Request, Response } from 'express';
import { NoAutorizado, Prohibido } from '../../compartido/errores.js';
import { autenticar } from './auth.servicio.js';
import type { Rol, UsuarioAutenticado } from './auth.tipos.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
      tokenSesion?: string;
    }
  }
}

/** Exige "Authorization: Bearer <token>" con una sesión vigente. Deja el usuario en req.usuario. */
export async function exigirSesion(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const cabecera = req.headers.authorization;
  const token = cabecera?.startsWith('Bearer ') ? cabecera.slice(7) : undefined;
  req.usuario = await autenticar(token);
  req.tokenSesion = token;
  next();
}

export function exigirRol(...roles: Rol[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.usuario) throw new NoAutorizado();
    if (!roles.includes(req.usuario.rol)) throw new Prohibido();
    next();
  };
}

/** El negocio de quien hace la petición: sale de la sesión, nunca de la URL. El superadmin no tiene. */
export function negocioDeSesion(req: Request): string {
  const { negocioId } = usuarioDe(req);
  if (!negocioId) throw new Prohibido();
  return negocioId;
}

/** El usuario de la petición; solo se usa detrás de exigirSesion. */
export function usuarioDe(req: Request): UsuarioAutenticado {
  if (!req.usuario) throw new NoAutorizado();
  return req.usuario;
}
