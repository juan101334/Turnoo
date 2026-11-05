import type { Transaccion } from '../../db/contexto.js';
import type { EstadoUsuario, Rol, UsuarioAutenticado, UsuarioDelNegocio } from './auth.tipos.js';

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
): Promise<{ id: string; rol: Rol; activo: boolean; pendiente: boolean } | null> {
  const { rows } = await tx.consultar<{ id: string; rol: Rol; activo: boolean; pendiente: boolean }>(
    'SELECT id, rol, activo, password_hash IS NULL AS pendiente FROM usuarios WHERE id = $1',
    [usuarioId],
  );
  return rows[0] ?? null;
}

/** Inactivo sin contraseña: invitado que no ha aceptado. Inactivo con contraseña: desactivado. */
function estadoDeUsuario(activo: boolean, pendiente: boolean): EstadoUsuario {
  if (activo) return 'activo';
  return pendiente ? 'pendiente' : 'desactivado';
}

export async function listarUsuarios(tx: Transaccion): Promise<UsuarioDelNegocio[]> {
  const { rows } = await tx.consultar<{
    id: string;
    email: string;
    nombre: string;
    rol: Rol;
    activo: boolean;
    pendiente: boolean;
    ultimo_login_en: Date | null;
    profesional_id: string | null;
  }>(
    `SELECT u.id, u.email, u.nombre, u.rol, u.activo, u.password_hash IS NULL AS pendiente,
            u.ultimo_login_en, p.id AS profesional_id
       FROM usuarios u LEFT JOIN profesionales p ON p.usuario_id = u.id
      ORDER BY u.nombre, u.id`,
  );
  return rows.map((f) => ({
    id: f.id,
    email: f.email,
    nombre: f.nombre,
    rol: f.rol,
    estado: estadoDeUsuario(f.activo, f.pendiente),
    ultimoLoginEn: f.ultimo_login_en,
    profesionalId: f.profesional_id,
  }));
}

/**
 * Ids de los dueños activos, con sus filas bloqueadas. El orden fijo evita bloqueos cruzados, y
 * el bloqueo impide que dos dueños se desactiven a la vez y el negocio quede sin ninguno.
 */
export async function bloquearDuenosActivos(tx: Transaccion): Promise<string[]> {
  const { rows } = await tx.consultar<{ id: string }>(
    "SELECT id FROM usuarios WHERE rol = 'dueno' AND activo ORDER BY id FOR UPDATE",
  );
  return rows.map((f) => f.id);
}

export async function desactivarUsuario(tx: Transaccion, usuarioId: string): Promise<void> {
  await tx.consultar('UPDATE usuarios SET activo = false WHERE id = $1', [usuarioId]);
}

/** Inutiliza los enlaces de invitación y recuperación que el usuario aún no haya usado. */
export async function invalidarTokensDeUsuario(tx: Transaccion, usuarioId: string, ahora: Date): Promise<void> {
  await tx.consultar(
    'UPDATE tokens_usuario SET usado_en = $2 WHERE usuario_id = $1 AND usado_en IS NULL',
    [usuarioId, ahora],
  );
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

/** Invitación: fija la contraseña y activa al usuario. Es la ÚNICA forma de activar a alguien. */
export async function activarConPassword(
  tx: Transaccion,
  usuarioId: string,
  passwordHash: string,
): Promise<void> {
  await tx.consultar('UPDATE usuarios SET password_hash = $2, activo = true WHERE id = $1', [
    usuarioId,
    passwordHash,
  ]);
}

/** Recuperación: cambia la contraseña solo si el usuario sigue activo. Dice si la cambió. */
export async function cambiarPasswordDeActivo(
  tx: Transaccion,
  usuarioId: string,
  passwordHash: string,
): Promise<boolean> {
  const { rowCount } = await tx.consultar(
    'UPDATE usuarios SET password_hash = $2 WHERE id = $1 AND activo',
    [usuarioId, passwordHash],
  );
  return rowCount === 1;
}

// ---------------------------------------------------------------------
// Intentos de login. Siempre se bloquean las filas en el mismo orden (por clave),
// para que dos intentos simultáneos no se queden esperándose entre sí.
// ---------------------------------------------------------------------

/** Crea los contadores que falten, reinicia los vencidos y los deja bloqueados. */
export async function abrirVentanasDeIntentos(
  tx: Transaccion,
  claves: string[],
  ahora: Date,
  vencidaAntesDe: Date,
): Promise<{ clave: string; intentos: number; ventanaInicio: Date }[]> {
  const { rows } = await tx.consultar<{ clave: string; intentos: number; ventana_inicio: Date }>(
    `INSERT INTO intentos_login (clave, intentos, ventana_inicio)
     SELECT clave, 0, $2::timestamptz FROM unnest($1::text[]) AS clave ORDER BY clave
     ON CONFLICT (clave) DO UPDATE SET
       intentos = CASE WHEN intentos_login.ventana_inicio <= $3 THEN 0 ELSE intentos_login.intentos END,
       ventana_inicio = CASE WHEN intentos_login.ventana_inicio <= $3
                             THEN EXCLUDED.ventana_inicio ELSE intentos_login.ventana_inicio END
     RETURNING clave, intentos, ventana_inicio`,
    [claves, ahora, vencidaAntesDe],
  );
  return rows.map((f) => ({ clave: f.clave, intentos: f.intentos, ventanaInicio: f.ventana_inicio }));
}

export async function sumarIntento(tx: Transaccion, claves: string[]): Promise<void> {
  await tx.consultar('UPDATE intentos_login SET intentos = intentos + 1 WHERE clave = ANY($1::text[])', [claves]);
}

export async function devolverIntento(tx: Transaccion, claves: string[], claveAReiniciar: string | null): Promise<void> {
  await tx.consultar('SELECT 1 FROM intentos_login WHERE clave = ANY($1::text[]) ORDER BY clave FOR UPDATE', [claves]);
  await tx.consultar(
    `UPDATE intentos_login
        SET intentos = CASE WHEN clave = $2 THEN 0 ELSE GREATEST(intentos - 1, 0) END
      WHERE clave = ANY($1::text[])`,
    [claves, claveAReiniciar],
  );
}

export async function borrarIntentosVencidos(tx: Transaccion, ventanaVencidaHasta: Date): Promise<number> {
  const { rowCount } = await tx.consultar('DELETE FROM intentos_login WHERE ventana_inicio <= $1', [ventanaVencidaHasta]);
  return rowCount ?? 0;
}
