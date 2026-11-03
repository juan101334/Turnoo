import { Router } from 'express';
import { z } from 'zod';
import { entorno } from '../../config/entorno.js';
import { validarEsquema } from '../../compartido/validacion.js';
import { exigirRol, exigirSesion, usuarioDe } from './auth.middleware.js';
import * as servicio from './auth.servicio.js';

export const rutasAuth = Router();

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
  res.json(await servicio.iniciarSesion(email, password));
});

rutasAuth.post('/logout', exigirSesion, async (req, res) => {
  await servicio.cerrarSesion(req.tokenSesion);
  res.status(204).end();
});

rutasAuth.get('/yo', exigirSesion, (req, res) => {
  res.json({ usuario: usuarioDe(req) });
});

rutasAuth.post('/usuarios/invitar', exigirSesion, exigirRol('superadmin', 'dueno'), async (req, res) => {
  const entrada = validarEsquema(
    z.object({
      email: z.string(),
      nombre: z.string(),
      rol: z.enum(['dueno', 'empleado']),
      negocioId: z.string().optional(),
    }),
    req.body,
  );
  const { usuarioId, token, expiraEn } = await servicio.invitarUsuario(usuarioDe(req), entrada);
  res.status(201).json({ usuarioId, enlace: enlace('/aceptar-invitacion', token), expiraEn });
});

rutasAuth.post('/usuarios/:id/recuperacion', exigirSesion, exigirRol('superadmin', 'dueno'), async (req, res) => {
  const { negocioId } = validarEsquema(z.object({ negocioId: z.string().optional() }), req.body ?? {});
  const { token, expiraEn } = await servicio.generarRecuperacion(
    usuarioDe(req),
    String(req.params.id),
    negocioId,
  );
  res.status(201).json({ enlace: enlace('/restablecer-contrasena', token), expiraEn });
});

const conToken = z.object({ token: z.string().max(200), password: contrasena });

rutasAuth.post('/aceptar-invitacion', async (req, res) => {
  const { token, password } = validarEsquema(conToken, req.body);
  await servicio.aceptarInvitacion(token, password);
  res.status(204).end();
});

rutasAuth.post('/restablecer', async (req, res) => {
  const { token, password } = validarEsquema(conToken, req.body);
  await servicio.restablecerContrasena(token, password);
  res.status(204).end();
});
