import { Router } from 'express';
import { z } from 'zod';
import { entorno } from '../../config/entorno.js';
import { validarEsquema } from '../../compartido/validacion.js';
import { limitar, porIp, type Limite } from '../../compartido/limite.js';
import { auditar } from '../auditoria/auditoria.http.js';
import { registrarAparte } from '../auditoria/auditoria.js';
import { exigirRol, exigirSesion, usuarioDe } from './auth.middleware.js';
import * as servicio from './auth.servicio.js';

/** Límites de peticiones de las rutas de auth (además del de intentos de login, en auth.intentos.ts). */
export interface LimitesAuth {
  /** Aceptar invitación y restablecer contraseña, por IP: sin sesión, con un token que adivinar. */
  publicas: Limite;
  /** Cambiar la contraseña, por usuario: cada intento verifica la actual con argon2. */
  contrasena: Limite;
  /** Invitar, reenviar invitación y generar recuperación, por usuario. */
  enlaces: Limite;
}

export function crearRutasAuth(limites: LimitesAuth) {
  const rutasAuth = Router();
  const limitePublicas = limitar(limites.publicas, porIp);
  // Van después de exigirSesion: la clave es el usuario, que ya está en la petición.
  const porUsuario = (req: Parameters<typeof usuarioDe>[0]) => usuarioDe(req).usuarioId;
  const limiteContrasena = limitar(limites.contrasena, porUsuario);
  const limiteEnlaces = limitar(limites.enlaces, porUsuario);
  // Solo el superadmin elige el negocio en el cuerpo; al dueño el servicio le usa siempre el suyo,
  // así que la auditoría también (si no, un negocioId ajeno en el cuerpo quedaría anotado).
  const negocioAfectado = (req: Parameters<typeof usuarioDe>[0], negocioId: string | undefined) =>
    usuarioDe(req).rol === 'superadmin' ? (negocioId ?? null) : undefined;


  // Las respuestas con tokens o enlaces nunca se guardan en cachés.
  rutasAuth.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Los enlaces llevan el token en el fragmento (#), que el navegador no envía al servidor
  // y por tanto no queda en registros de acceso.
  const enlace = (ruta: string, token: string) =>
    `${entorno.PANEL_URL}${ruta}#token=${encodeURIComponent(token)}`;

  const contrasena = z.string().max(128);

  rutasAuth.post('/login', async (req, res) => {
    const { email, password } = validarEsquema(z.object({ email: z.string().max(254), password: contrasena }), req.body);
    res.json(await servicio.iniciarSesion(email, password, new Date(), req.ip ?? null));
  });

  rutasAuth.post('/logout', exigirSesion, async (req, res) => {
    await servicio.cerrarSesion(req.tokenSesion);
    await auditar(req, 'cerrar_sesion');
    res.status(204).end();
  });

  rutasAuth.get('/yo', exigirSesion, async (req, res) => {
    res.json(await servicio.quienSoy(usuarioDe(req)));
  });

  /** Nombre de la cuenta: de 2 a 100 caracteres (como en la invitación), sin espacios de más. */
  const nombreDeCuenta = z
    .string()
    .max(500)
    .transform((s) => s.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100, 'El nombre puede tener hasta 100 caracteres'));

  /** Cambiar el nombre de la propia cuenta. Estricto: un id u otro campo en el cuerpo se rechaza. */
  rutasAuth.patch('/yo', exigirSesion, async (req, res) => {
    const { nombre } = validarEsquema(z.strictObject({ nombre: nombreDeCuenta }), req.body);
    res.json(await servicio.cambiarMiNombre(usuarioDe(req), nombre));
  });

  /** Cerrar la sesión en los demás dispositivos; la de esta petición sigue abierta. */
  rutasAuth.post('/sesiones/cerrar-otras', exigirSesion, async (req, res) => {
    const resultado = await servicio.cerrarOtrasSesiones(req.tokenSesion);
    await auditar(req, 'cerrar_otras_sesiones', { detalle: { cerradas: resultado.cerradas } });
    res.json(resultado);
  });

  /** Cambiar la propia contraseña, con la actual. Las demás sesiones del usuario se cierran. */
  rutasAuth.post('/contrasena', exigirSesion, limiteContrasena, async (req, res) => {
    const { actual, nueva } = validarEsquema(z.object({ actual: contrasena, nueva: contrasena }), req.body);
    await servicio.cambiarContrasena(req.tokenSesion, actual, nueva);
    await auditar(req, 'cambiar_contrasena');
    res.status(204).end();
  });

  rutasAuth.post('/usuarios/invitar', exigirSesion, exigirRol('superadmin', 'dueno'), limiteEnlaces, async (req, res) => {
    const entrada = validarEsquema(
      z.object({
        email: z.string(),
        nombre: z.string(),
        rol: z.enum(['dueno', 'empleado']),
        negocioId: z.string().optional(),
        profesionalId: z.string().optional(),
      }),
      req.body,
    );
    const { usuarioId, token, expiraEn } = await servicio.invitarUsuario(usuarioDe(req), entrada);
    // Sin el correo: el id del invitado basta para encontrarlo.
    await auditar(req, 'invitar_usuario', { negocioId: negocioAfectado(req, entrada.negocioId), detalle: { invitadoId: usuarioId, rol: entrada.rol } });
    res.status(201).json({ usuarioId, enlace: enlace('/aceptar-invitacion', token), expiraEn });
  });

  rutasAuth.get('/usuarios', exigirSesion, exigirRol('superadmin', 'dueno'), async (req, res) => {
    const { negocioId } = validarEsquema(z.object({ negocioId: z.string().optional() }), req.query);
    res.json({ usuarios: await servicio.listarUsuarios(usuarioDe(req), negocioId) });
  });

  rutasAuth.post('/usuarios/:id/desactivar', exigirSesion, exigirRol('superadmin', 'dueno'), async (req, res) => {
    const { negocioId } = validarEsquema(z.object({ negocioId: z.string().optional() }), req.body ?? {});
    await servicio.desactivarUsuario(usuarioDe(req), String(req.params.id), negocioId);
    await auditar(req, 'desactivar_usuario', { negocioId: negocioAfectado(req, negocioId), detalle: { afectadoId: String(req.params.id) } });
    res.status(204).end();
  });

  rutasAuth.post('/usuarios/:id/reenviar-invitacion', exigirSesion, exigirRol('superadmin', 'dueno'), limiteEnlaces, async (req, res) => {
    const { negocioId } = validarEsquema(z.object({ negocioId: z.string().optional() }), req.body ?? {});
    const { token, expiraEn } = await servicio.reenviarInvitacion(usuarioDe(req), String(req.params.id), negocioId);
    await auditar(req, 'reenviar_invitacion', { negocioId: negocioAfectado(req, negocioId), detalle: { afectadoId: String(req.params.id) } });
    res.status(201).json({ enlace: enlace('/aceptar-invitacion', token), expiraEn });
  });

  rutasAuth.post('/usuarios/:id/recuperacion', exigirSesion, exigirRol('superadmin', 'dueno'), limiteEnlaces, async (req, res) => {
    const { negocioId } = validarEsquema(z.object({ negocioId: z.string().optional() }), req.body ?? {});
    const { token, expiraEn } = await servicio.generarRecuperacion(
      usuarioDe(req),
      String(req.params.id),
      negocioId,
    );
    await auditar(req, 'generar_recuperacion', { negocioId: negocioAfectado(req, negocioId), detalle: { afectadoId: String(req.params.id) } });
    res.status(201).json({ enlace: enlace('/restablecer-contrasena', token), expiraEn });
  });

  const conToken = z.object({ token: z.string().max(200), password: contrasena });

  rutasAuth.post('/aceptar-invitacion', limitePublicas, async (req, res) => {
    const { token, password } = validarEsquema(conToken, req.body);
    const quien = await servicio.aceptarInvitacion(token, password);
    await registrarAparte({ accion: 'aceptar_invitacion', ...quien, ip: req.ip ?? null });
    res.status(204).end();
  });

  rutasAuth.post('/restablecer', limitePublicas, async (req, res) => {
    const { token, password } = validarEsquema(conToken, req.body);
    const quien = await servicio.restablecerContrasena(token, password);
    await registrarAparte({ accion: 'restablecer_contrasena', ...quien, ip: req.ip ?? null });
    res.status(204).end();
  });

  return rutasAuth;
}
