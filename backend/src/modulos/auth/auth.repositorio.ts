import type { Transaccion } from '../../db/contexto.js';
import type { Rol, UsuarioAutenticado } from './auth.tipos.js';

/** Único lugar con SQL del módulo de autenticación. */

export async function crearSesion(
  tx: Transaccion,
  s: { negocioId: string | null; usuarioId: string; tokenHash: string; expiraEn: Date },
): Promise<void> {
  await tx.consultar(
    'INSERT INTO sesiones (negocio_id, usuario_id, token_hash, expira_en) VALUES ($1, $2, $3, $4)',
    [s.negocioId, s.usuarioId, s.tokenHash, s.expiraEn],
  );
}

/** Sesión vigente de un usuario activo. `negocioId` debe coincidir con el de la sesión (null = superadmin). */
export async function buscarSesion(
  tx: Transaccion,
  tokenHash: string,
  negocioId: string | null,
  ahora: Date,
): Promise<UsuarioAutenticado | null> {
  const { rows } = await tx.consultar<{
    usuario_id: string;
    negocio_id: string | null;
    rol: Rol;
    nombre: string;
  }>(
    `SELECT u.id AS usuario_id, u.negocio_id, u.rol, u.nombre
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = $1 AND s.negocio_id IS NOT DISTINCT FROM $2::uuid
        AND s.revocada_en IS NULL AND s.expira_en > $3 AND u.activo`,
    [tokenHash, negocioId, ahora],
  );
  const f = rows[0];
  return f ? { usuarioId: f.usuario_id, negocioId: f.negocio_id, rol: f.rol, nombre: f.nombre } : null;
}

export async function revocarSesion(tx: Transaccion, tokenHash: string, ahora: Date): Promise<void> {
  await tx.consultar(
    'UPDATE sesiones SET revocada_en = $2 WHERE token_hash = $1 AND revocada_en IS NULL',
    [tokenHash, ahora],
  );
}

export async function revocarSesionesDeUsuario(
  tx: Transaccion,
  usuarioId: string,
  ahora: Date,
): Promise<void> {
  await tx.consultar(
    'UPDATE sesiones SET revocada_en = $2 WHERE usuario_id = $1 AND revocada_en IS NULL',
    [usuarioId, ahora],
  );
}

export async function registrarLogin(tx: Transaccion, usuarioId: string, ahora: Date): Promise<void> {
  await tx.consultar('UPDATE usuarios SET ultimo_login_en = $2 WHERE id = $1', [usuarioId, ahora]);
}

/** Usuario sin contraseña e inactivo, a la espera de aceptar su invitación. */
export async function crearUsuarioInvitado(
  tx: Transaccion,
  u: { negocioId: string | null; email: string; nombre: string; rol: Rol },
): Promise<string> {
  const { rows } = await tx.consultar<{ id: string }>(
    `INSERT INTO usuarios (negocio_id, email, nombre, rol, activo)
     VALUES ($1, $2, $3, $4, false) RETURNING id`,
    [u.negocioId, u.email, u.nombre, u.rol],
  );
  return rows[0]!.id;
}

export async function obtenerUsuario(
  tx: Transaccion,
  usuarioId: string,
): Promise<{ id: string; rol: Rol } | null> {
  const { rows } = await tx.consultar<{ id: string; rol: Rol }>(
    'SELECT id, rol FROM usuarios WHERE id = $1',
    [usuarioId],
  );
  return rows[0] ?? null;
}

export async function crearToken(
  tx: Transaccion,
  t: { usuarioId: string; tipo: 'invitacion' | 'recuperacion'; tokenHash: string; expiraEn: Date },
): Promise<void> {
  await tx.consultar(
    'INSERT INTO tokens_usuario (usuario_id, tipo, token_hash, expira_en) VALUES ($1, $2, $3, $4)',
    [t.usuarioId, t.tipo, t.tokenHash, t.expiraEn],
  );
}

/** Marca el token como usado y devuelve su usuario. Atómico: un token solo sirve una vez. */
export async function consumirToken(
  tx: Transaccion,
  tokenHash: string,
  tipo: 'invitacion' | 'recuperacion',
  ahora: Date,
): Promise<string | null> {
  const { rows } = await tx.consultar<{ usuario_id: string }>(
    `UPDATE tokens_usuario SET usado_en = $3
      WHERE token_hash = $1 AND tipo = $2 AND usado_en IS NULL AND expira_en > $3
      RETURNING usuario_id`,
    [tokenHash, tipo, ahora],
  );
  return rows[0]?.usuario_id ?? null;
}

/** Fija la contraseña y deja al usuario activo. */
export async function definirPassword(
  tx: Transaccion,
  usuarioId: string,
  passwordHash: string,
): Promise<void> {
  await tx.consultar('UPDATE usuarios SET password_hash = $2, activo = true WHERE id = $1', [
    usuarioId,
    passwordHash,
  ]);
}
