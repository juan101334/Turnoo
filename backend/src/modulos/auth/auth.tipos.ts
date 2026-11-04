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
  negocioId?: string | undefined;
  /** Obligatorio para un empleado: sin barbero no tendría acceso a nada. */
  profesionalId?: string | undefined;
}

export type EstadoUsuario = 'activo' | 'pendiente' | 'desactivado';

/** Lo que el panel ve de un usuario. Nunca incluye la contraseña ni sus tokens. */
export interface UsuarioDelNegocio {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  estado: EstadoUsuario;
  ultimoLoginEn: Date | null;
  profesionalId: string | null;
}

/** Enlace de un solo uso (invitación o recuperación). */
export interface EnlaceUnico {
  token: string;
  expiraEn: Date;
}
