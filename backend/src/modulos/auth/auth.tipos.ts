export type Rol = 'superadmin' | 'dueno' | 'empleado';

/** Quién está haciendo la petición, ya verificado a partir de su sesión. */
export interface UsuarioAutenticado {
  usuarioId: string;
  /** null = superadmin (no pertenece a ningún negocio). */
  negocioId: string | null;
  rol: Rol;
  nombre: string;
}

export interface SesionIniciada {
  /** Se entrega UNA sola vez; en la base solo queda su hash. */
  token: string;
  expiraEn: Date;
  usuario: UsuarioAutenticado;
}

export interface EntradaInvitacion {
  email: string;
  nombre: string;
  rol: Exclude<Rol, 'superadmin'>;
  /** Solo lo indica el superadmin; el dueño siempre invita a SU negocio. */
  negocioId?: string;
}

/** Enlace de un solo uso (invitación o recuperación). */
export interface EnlaceUnico {
  token: string;
  expiraEn: Date;
}
