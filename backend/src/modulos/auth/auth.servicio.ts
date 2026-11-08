import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import {
  Conflicto,
  DatosInvalidos,
  NoAutorizado,
  NoEncontrado,
  Prohibido,
} from '../../compartido/errores.js';
import { esUuid } from '../../compartido/validacion.js';
import { conNegocio, conSistema, type Transaccion } from '../../db/contexto.js';
import { usuarioParaLogin } from '../../db/previas.js';
import { estadoDeNegocio } from '../negocios/negocios.reglas.js';
import { asociarUsuarioABarbero } from '../profesionales/profesionales.reglas.js';
import { liberarIntento, reservarIntento } from './auth.intentos.js';
import * as repositorio from './auth.repositorio.js';
import type {
  EnlaceUnico,
  EntradaInvitacion,
  SesionIniciada,
  UsuarioAutenticado,
  UsuarioDelNegocio,
} from './auth.tipos.js';

const MS_POR_HORA = 3_600_000;
const HORAS_SESION = 7 * 24;
const HORAS_INVITACION = 72;
const HORAS_RECUPERACION = 1;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128; // argon2 es costoso: no se aceptan contraseñas enormes

const MENSAJE_LOGIN = 'Correo o contraseña incorrectos';
const MENSAJE_ENLACE = 'El enlace no es válido o ya venció';
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMATO_SECRETO = /^[A-Za-z0-9_-]{43}$/; // 32 bytes en base64url

// ---------------------------------------------------------------------
// Tokens. Formato: "<negocioId|sis>.<secreto>". El negocio va en el token para poder
// consultar CON aislamiento (conNegocio) sin una función que se salte el RLS.
// En la base solo se guarda el SHA-256 del secreto. Un token no sirve en otro negocio.
// ---------------------------------------------------------------------

const sha256 = (texto: string) => createHash('sha256').update(texto).digest('hex');

function generarToken(negocioId: string | null): { token: string; hash: string } {
  const secreto = randomBytes(32).toString('base64url');
  return { token: `${negocioId ?? 'sis'}.${secreto}`, hash: sha256(secreto) };
}

function leerToken(token: unknown): { negocioId: string | null; hash: string } | null {
  if (typeof token !== 'string') return null;
  const [prefijo, secreto, ...resto] = token.split('.');
  if (resto.length > 0 || !prefijo || !secreto || !FORMATO_SECRETO.test(secreto)) return null;
  if (prefijo === 'sis') return { negocioId: null, hash: sha256(secreto) };
  return esUuid(prefijo) ? { negocioId: prefijo, hash: sha256(secreto) } : null;
}

/** Con negocio: aislado a él. Sin negocio (superadmin): contexto de sistema. */
function enAmbito<T>(negocioId: string | null, trabajo: (tx: Transaccion) => Promise<T>): Promise<T> {
  return negocioId ? conNegocio(negocioId, trabajo) : conSistema(trabajo);
}

const sumarHoras = (instante: Date, horas: number) => new Date(instante.getTime() + horas * MS_POR_HORA);

// ---------------------------------------------------------------------
// Contraseñas
// ---------------------------------------------------------------------

function validarPassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw new DatosInvalidos(
      `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres`,
    );
  }
}

let hashFalso: Promise<string> | undefined;
/** Para que un correo inexistente tarde lo mismo que uno existente (no revelar cuáles existen). */
const hashDeRelleno = () => (hashFalso ??= argon2.hash('relleno-sin-uso-real'));

// ---------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------

export async function iniciarSesion(
  email: unknown,
  password: unknown,
  ahora: Date = new Date(),
  ip: string | null = null,
): Promise<SesionIniciada> {
  if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length > PASSWORD_MAX) {
    throw new NoAutorizado(MENSAJE_LOGIN);
  }
  await reservarIntento(email, ip, ahora);
  const usuario = await usuarioParaLogin(email.trim());
  const coincide = await argon2
    .verify(usuario?.passwordHash ?? (await hashDeRelleno()), password)
    .catch(() => false);
  if (!usuario || !usuario.activo || !usuario.passwordHash || !coincide) {
    throw new NoAutorizado(MENSAJE_LOGIN);
  }
  await liberarIntento(email, ip);

  const { token, hash } = generarToken(usuario.negocioId);
  const expiraEn = sumarHoras(ahora, HORAS_SESION);
  await enAmbito(usuario.negocioId, async (tx) => {
    await repositorio.crearSesion(tx, {
      negocioId: usuario.negocioId,
      usuarioId: usuario.id,
      tokenHash: hash,
      expiraEn,
    });
    await repositorio.registrarLogin(tx, usuario.id, ahora);
  });
  return {
    token,
    expiraEn,
    usuario: { usuarioId: usuario.id, negocioId: usuario.negocioId, rol: usuario.rol, nombre: usuario.nombre },
  };
}

/** Quién es el dueño de este token de sesión. Lanza NoAutorizado si no es válido, venció o se revocó. */
export async function autenticar(token: unknown, ahora: Date = new Date()): Promise<UsuarioAutenticado> {
  const leido = leerToken(token);
  const usuario = leido
    ? await enAmbito(leido.negocioId, (tx) => repositorio.buscarSesion(tx, leido.hash, leido.negocioId, ahora))
    : null;
  if (!usuario) throw new NoAutorizado('Tu sesión no es válida o venció. Inicia sesión de nuevo');
  return usuario;
}

/**
 * Quién es el usuario de la sesión y, si pertenece a un negocio, su nombre y zona horaria: el
 * panel los necesita para saber qué es "hoy". GET /negocio no sirve, porque es solo del dueño.
 */
export async function quienSoy(
  usuario: UsuarioAutenticado,
): Promise<{ usuario: UsuarioAutenticado; negocio: { nombre: string; zonaHoraria: string } | null }> {
  const { negocioId } = usuario;
  if (!negocioId) return { usuario, negocio: null };
  return { usuario, negocio: await conNegocio(negocioId, (tx) => repositorio.negocioDeLaSesion(tx, negocioId)) };
}

export async function cerrarSesion(token: unknown, ahora: Date = new Date()): Promise<void> {
  const leido = leerToken(token);
  if (!leido) return;
  await enAmbito(leido.negocioId, (tx) => repositorio.revocarSesion(tx, leido.hash, ahora));
}

// ---------------------------------------------------------------------
// Invitaciones y recuperación. El backend entrega el token a QUIEN ADMINISTRA
// (dueño o superadmin), que se lo hace llegar a la persona. Nunca se devuelve
// a quien lo pide por sí mismo: eso permitiría robar cuentas.
// ---------------------------------------------------------------------

function validarInvitacion(e: EntradaInvitacion): void {
  if (typeof e.email !== 'string' || e.email.length > 254 || !FORMATO_EMAIL.test(e.email)) {
    throw new DatosInvalidos('El correo no es válido');
  }
  if (typeof e.nombre !== 'string' || e.nombre.trim().length === 0 || e.nombre.length > 100) {
    throw new DatosInvalidos('El nombre es obligatorio (máximo 100 caracteres)');
  }
  if (e.rol !== 'dueno' && e.rol !== 'empleado') {
    throw new DatosInvalidos('El rol debe ser dueno o empleado');
  }
  if (e.rol === 'empleado' && e.profesionalId === undefined) {
    throw new DatosInvalidos('Para invitar a un empleado debes indicar su barbero');
  }
  if (e.rol === 'dueno' && e.profesionalId !== undefined) {
    throw new DatosInvalidos('Un dueño se asocia a un barbero después de crearse, no en la invitación');
  }
}

/** Negocio sobre el que puede actuar quien hace la petición. */
function negocioDeAccion(actor: UsuarioAutenticado, negocioId: string | undefined): string {
  if (actor.rol === 'superadmin') {
    if (!esUuid(negocioId)) throw new DatosInvalidos('Debes indicar el negocio');
    return negocioId;
  }
  if (actor.rol !== 'dueno' || !actor.negocioId) throw new Prohibido();
  if (negocioId !== undefined && negocioId !== actor.negocioId) throw new Prohibido();
  return actor.negocioId;
}

/**
 * El negocio debe existir, y un dueño no administra usuarios si está suspendido.
 * El superadmin sí puede, para ayudar a recuperar el acceso mientras se regulariza.
 */
async function exigirNegocioAdministrable(
  tx: Transaccion,
  actor: UsuarioAutenticado,
  negocioId: string,
): Promise<void> {
  const estado = await estadoDeNegocio(tx, negocioId);
  if (actor.rol !== 'superadmin' && estado === 'suspendido') {
    throw new Prohibido('El negocio está suspendido');
  }
}

export async function invitarUsuario(
  actor: UsuarioAutenticado,
  entrada: EntradaInvitacion,
  ahora: Date = new Date(),
): Promise<EnlaceUnico & { usuarioId: string }> {
  validarInvitacion(entrada);
  const negocioId = negocioDeAccion(actor, entrada.negocioId);
  const { token, hash } = generarToken(negocioId);
  const expiraEn = sumarHoras(ahora, HORAS_INVITACION);

  const usuarioId = await conNegocio(negocioId, async (tx) => {
    await exigirNegocioAdministrable(tx, actor, negocioId);
    const id = await repositorio.crearUsuarioInvitado(tx, {
      negocioId,
      email: entrada.email.trim(),
      nombre: entrada.nombre.trim(),
      rol: entrada.rol,
    });
    if (entrada.profesionalId !== undefined) {
      // Una invitación no le quita el acceso a quien ya atiende con ese barbero.
      await asociarUsuarioABarbero(tx, entrada.profesionalId, id, { reemplazar: false });
    }
    await repositorio.crearToken(tx, { usuarioId: id, tipo: 'invitacion', tokenHash: hash, expiraEn });
    return id;
  });
  return { usuarioId, token, expiraEn };
}

/** Solo para el script de arranque (crear el primer superadmin). No pasa por ninguna ruta HTTP. */
export async function invitarSuperadmin(
  email: string,
  nombre: string,
  ahora: Date = new Date(),
): Promise<EnlaceUnico> {
  if (!FORMATO_EMAIL.test(email) || nombre.trim().length === 0) {
    throw new DatosInvalidos('Correo o nombre no válidos');
  }
  const { token, hash } = generarToken(null);
  const expiraEn = sumarHoras(ahora, HORAS_INVITACION);
  await conSistema(async (tx) => {
    const id = await repositorio.crearUsuarioInvitado(tx, {
      negocioId: null,
      email: email.trim(),
      nombre: nombre.trim(),
      rol: 'superadmin',
    });
    await repositorio.crearToken(tx, { usuarioId: id, tipo: 'invitacion', tokenHash: hash, expiraEn });
  });
  return { token, expiraEn };
}

/**
 * Solo para el script de recuperación (`npm run recuperar-superadmin`), que exige acceso al
 * servidor: no pasa por ninguna ruta HTTP. Anula los enlaces anteriores del superadmin y da uno nuevo:
 * - activo: enlace de recuperación (1 h); al usarlo se cierran sus sesiones;
 * - invitado que nunca definió su contraseña: invitación nueva (72 h);
 * - desactivado: no hay enlace, porque la recuperación nunca reactiva.
 */
export async function recuperarSuperadmin(
  email: string,
  ahora: Date = new Date(),
): Promise<EnlaceUnico & { tipo: 'invitacion' | 'recuperacion' }> {
  if (!FORMATO_EMAIL.test(email.trim())) throw new DatosInvalidos('Correo no válido');
  return conSistema(async (tx) => {
    const usuario = await repositorio.superadminPorEmail(tx, email.trim());
    if (!usuario) throw new NoEncontrado('El superadmin');
    if (!usuario.activo && !usuario.pendiente) {
      throw new Conflicto('El superadmin está desactivado: la recuperación no lo reactiva');
    }
    const tipo = usuario.activo ? 'recuperacion' : 'invitacion';
    const { token, hash } = generarToken(null);
    const expiraEn = sumarHoras(ahora, tipo === 'recuperacion' ? HORAS_RECUPERACION : HORAS_INVITACION);
    await repositorio.invalidarTokensDeUsuario(tx, usuario.id, ahora);
    await repositorio.crearToken(tx, { usuarioId: usuario.id, tipo, tokenHash: hash, expiraEn });
    return { token, expiraEn, tipo };
  });
}

/** Consume el token y fija la contraseña, todo en una transacción. */
async function usarToken(
  token: unknown,
  tipo: 'invitacion' | 'recuperacion',
  password: unknown,
  ahora: Date,
): Promise<void> {
  validarPassword(password);
  const leido = leerToken(token);
  if (!leido) throw new NoAutorizado(MENSAJE_ENLACE);

  await enAmbito(leido.negocioId, async (tx) => {
    const usuarioId = await repositorio.consumirToken(tx, leido.hash, tipo, ahora);
    if (!usuarioId) throw new NoAutorizado(MENSAJE_ENLACE);
    const passwordHash = await argon2.hash(password);
    if (tipo === 'invitacion') {
      await repositorio.activarConPassword(tx, usuarioId, passwordHash);
      return;
    }
    // La recuperación nunca reactiva: a un usuario desactivado su enlace no le sirve.
    if (!(await repositorio.cambiarPasswordDeActivo(tx, usuarioId, passwordHash))) {
      throw new NoAutorizado(MENSAJE_ENLACE);
    }
    await repositorio.revocarSesionesDeUsuario(tx, usuarioId, ahora);
  });
}

export const aceptarInvitacion = (token: unknown, password: unknown, ahora: Date = new Date()) =>
  usarToken(token, 'invitacion', password, ahora);

export const restablecerContrasena = (token: unknown, password: unknown, ahora: Date = new Date()) =>
  usarToken(token, 'recuperacion', password, ahora);

/** El dueño genera el enlace para un EMPLEADO suyo; el superadmin, para cualquier usuario de un negocio. */
export async function generarRecuperacion(
  actor: UsuarioAutenticado,
  usuarioId: string,
  negocioId?: string,
  ahora: Date = new Date(),
): Promise<EnlaceUnico> {
  if (!esUuid(usuarioId)) throw new DatosInvalidos('El usuario indicado no es válido');
  const destino = negocioDeAccion(actor, negocioId);
  const { token, hash } = generarToken(destino);
  const expiraEn = sumarHoras(ahora, HORAS_RECUPERACION);

  await conNegocio(destino, async (tx) => {
    await exigirNegocioAdministrable(tx, actor, destino);
    const objetivo = await repositorio.obtenerUsuario(tx, usuarioId);
    if (!objetivo) throw new NoEncontrado('El usuario');
    if (actor.rol === 'dueno' && objetivo.rol !== 'empleado') throw new Prohibido();
    if (!objetivo.activo) {
      throw new Conflicto('El usuario no está activo: usa reenviar invitación');
    }
    await repositorio.crearToken(tx, { usuarioId, tipo: 'recuperacion', tokenHash: hash, expiraEn });
  });
  return { token, expiraEn };
}

// ---------------------------------------------------------------------
// Administración de usuarios del negocio
// ---------------------------------------------------------------------

export async function listarUsuarios(
  actor: UsuarioAutenticado,
  negocioId?: string,
): Promise<UsuarioDelNegocio[]> {
  const destino = negocioDeAccion(actor, negocioId);
  return conNegocio(destino, async (tx) => {
    await estadoDeNegocio(tx, destino);
    return repositorio.listarUsuarios(tx);
  });
}

/**
 * Corta el acceso de inmediato: cierra sus sesiones y anula sus enlaces pendientes, para que una
 * invitación vieja no lo reactive. Solo una invitación NUEVA vuelve a dar acceso.
 */
export async function desactivarUsuario(
  actor: UsuarioAutenticado,
  usuarioId: string,
  negocioId?: string,
  ahora: Date = new Date(),
): Promise<void> {
  if (!esUuid(usuarioId)) throw new DatosInvalidos('El usuario indicado no es válido');
  const destino = negocioDeAccion(actor, negocioId);

  await conNegocio(destino, async (tx) => {
    await exigirNegocioAdministrable(tx, actor, destino);
    const objetivo = await repositorio.obtenerUsuario(tx, usuarioId);
    if (!objetivo) throw new NoEncontrado('El usuario');
    if (objetivo.rol === 'dueno') {
      const activos = await repositorio.bloquearDuenosActivos(tx);
      if (activos.length === 1 && activos[0] === usuarioId) {
        throw new Conflicto('No se puede desactivar al último dueño activo del negocio');
      }
    }
    await repositorio.desactivarUsuario(tx, usuarioId);
    await repositorio.revocarSesionesDeUsuario(tx, usuarioId, ahora);
    await repositorio.invalidarTokensDeUsuario(tx, usuarioId, ahora);
  });
}

/**
 * Nuevo enlace para un usuario pendiente (su invitación venció o se perdió) o desactivado (es la
 * forma de reactivarlo). Anula los anteriores. Quien recibe el enlace define la contraseña, así que
 * el dueño solo puede pedirlo para empleados, igual que la recuperación.
 */
export async function reenviarInvitacion(
  actor: UsuarioAutenticado,
  usuarioId: string,
  negocioId?: string,
  ahora: Date = new Date(),
): Promise<EnlaceUnico> {
  if (!esUuid(usuarioId)) throw new DatosInvalidos('El usuario indicado no es válido');
  const destino = negocioDeAccion(actor, negocioId);
  const { token, hash } = generarToken(destino);
  const expiraEn = sumarHoras(ahora, HORAS_INVITACION);

  await conNegocio(destino, async (tx) => {
    await exigirNegocioAdministrable(tx, actor, destino);
    const objetivo = await repositorio.obtenerUsuario(tx, usuarioId);
    if (!objetivo) throw new NoEncontrado('El usuario');
    if (actor.rol === 'dueno' && objetivo.rol !== 'empleado') throw new Prohibido();
    if (objetivo.activo) throw new Conflicto('El usuario ya está activo: usa recuperación de contraseña');

    await repositorio.invalidarTokensDeUsuario(tx, usuarioId, ahora);
    await repositorio.crearToken(tx, { usuarioId, tipo: 'invitacion', tokenHash: hash, expiraEn });
  });
  return { token, expiraEn };
}
