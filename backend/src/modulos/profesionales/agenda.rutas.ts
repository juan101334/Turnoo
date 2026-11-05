import { Router, type Request } from 'express';
import { z } from 'zod';
import { DatosInvalidos, NoEncontrado, Prohibido } from '../../compartido/errores.js';
import { instanteIso, validarEsquema } from '../../compartido/validacion.js';
import { exigirRol, exigirSesion, negocioDeSesion, usuarioDe } from '../auth/auth.middleware.js';
import * as servicio from './agenda.servicio.js';
import { profesionalDelUsuario } from './profesionales.servicio.js';

/**
 * Servicios y horarios de un barbero. El dueño gestiona los de cualquiera; el empleado, solo los
 * suyos: un barbero ajeno se responde como "no existe". Se monta bajo /profesionales/:id, que ya
 * exige sesión y excluye al superadmin.
 */
export const rutasAgendaDelBarbero = Router({ mergeParams: true });

const nombre = z.string().trim().min(1, 'El nombre es obligatorio').max(100);
const duracion = z.number().int().min(1).max(480);
const precio = z.number().int().min(0).max(100_000_000);
const horaInicio = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Debe ser una hora HH:MM');
const horaFin = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, 'Debe ser una hora HH:MM');

/** Negocio y barbero de la ruta, si quien pide puede actuar sobre ese barbero. */
async function barberoDeRuta(req: Request): Promise<{ negocioId: string; profesionalId: string }> {
  const negocioId = negocioDeSesion(req);
  const profesionalId = String(req.params.id);
  const usuario = usuarioDe(req);
  if (usuario.rol !== 'dueno') {
    const propio = await profesionalDelUsuario(negocioId, usuario.usuarioId);
    if (propio?.id !== profesionalId) throw new NoEncontrado('El barbero');
  }
  return { negocioId, profesionalId };
}

rutasAgendaDelBarbero.get('/servicios', async (req, res) => {
  const { negocioId, profesionalId } = await barberoDeRuta(req);
  res.json({ servicios: await servicio.listarServicios(negocioId, profesionalId) });
});

rutasAgendaDelBarbero.post('/servicios', async (req, res) => {
  const { negocioId, profesionalId } = await barberoDeRuta(req);
  const entrada = validarEsquema(
    z.strictObject({ nombre, duracionMinutos: duracion, precioCop: precio }),
    req.body,
  );
  res.status(201).json(await servicio.crearServicio(negocioId, profesionalId, entrada));
});

rutasAgendaDelBarbero.patch('/servicios/:servicioId', async (req, res) => {
  const { negocioId, profesionalId } = await barberoDeRuta(req);
  const cambios = validarEsquema(
    z.strictObject({
      nombre: nombre.optional(),
      duracionMinutos: duracion.optional(),
      precioCop: precio.optional(),
    }),
    req.body,
  );
  res.json(await servicio.actualizarServicio(negocioId, profesionalId, String(req.params.servicioId), cambios));
});

rutasAgendaDelBarbero.post('/servicios/:servicioId/desactivar', async (req, res) => {
  const { negocioId, profesionalId } = await barberoDeRuta(req);
  res.json(await servicio.cambiarServicioActivo(negocioId, profesionalId, String(req.params.servicioId), false));
});

rutasAgendaDelBarbero.post('/servicios/:servicioId/activar', async (req, res) => {
  const { negocioId, profesionalId } = await barberoDeRuta(req);
  res.json(await servicio.cambiarServicioActivo(negocioId, profesionalId, String(req.params.servicioId), true));
});

rutasAgendaDelBarbero.get('/horarios', async (req, res) => {
  const { negocioId, profesionalId } = await barberoDeRuta(req);
  res.json({ horarios: await servicio.listarHorarios(negocioId, profesionalId) });
});

rutasAgendaDelBarbero.post('/horarios', async (req, res) => {
  const { negocioId, profesionalId } = await barberoDeRuta(req);
  const entrada = validarEsquema(
    z.strictObject({ diaSemana: z.number().int().min(1).max(7), horaInicio, horaFin }),
    req.body,
  );
  res.status(201).json(await servicio.crearHorario(negocioId, profesionalId, entrada));
});

rutasAgendaDelBarbero.delete('/horarios/:horarioId', async (req, res) => {
  const { negocioId, profesionalId } = await barberoDeRuta(req);
  res.json(await servicio.eliminarHorario(negocioId, profesionalId, String(req.params.horarioId)));
});

/**
 * Bloqueos. El dueño maneja todos, incluidos los de todo el negocio. El empleado ve los suyos y los
 * del negocio, pero solo crea y quita los suyos. El superadmin no entra.
 */
export const rutasBloqueos = Router();
rutasBloqueos.use(exigirSesion, exigirRol('dueno', 'empleado'));

/** null = todo el negocio (dueño); con valor = solo ese barbero (empleado). */
async function alcanceDeBloqueos(req: Request): Promise<string | null> {
  const usuario = usuarioDe(req);
  if (usuario.rol === 'dueno') return null;
  const propio = await profesionalDelUsuario(negocioDeSesion(req), usuario.usuarioId);
  if (!propio) throw new Prohibido('Tu usuario no está asociado a un barbero');
  return propio.id;
}

rutasBloqueos.get('/', async (req, res) => {
  const negocioId = negocioDeSesion(req);
  const soloBarbero = await alcanceDeBloqueos(req);
  const q = validarEsquema(
    z.object({ desde: instanteIso, hasta: instanteIso, profesionalId: z.string().optional() }),
    req.query,
  );
  if (soloBarbero !== null && q.profesionalId !== undefined && q.profesionalId !== soloBarbero) {
    throw new Prohibido();
  }
  res.json({
    bloqueos: await servicio.listarBloqueos(negocioId, {
      desde: q.desde,
      hasta: q.hasta,
      profesionalId: soloBarbero ?? q.profesionalId ?? null,
    }),
  });
});

rutasBloqueos.post('/', async (req, res) => {
  const negocioId = negocioDeSesion(req);
  const soloBarbero = await alcanceDeBloqueos(req);
  const entrada = validarEsquema(
    z.strictObject({
      profesionalId: z.string().nullable().optional(),
      inicio: instanteIso,
      fin: instanteIso,
      motivo: z.string().trim().max(200).optional(),
    }),
    req.body,
  );

  // El dueño debe decirlo expresamente: un olvido no puede cerrar todo el negocio.
  if (soloBarbero === null && entrada.profesionalId === undefined) {
    throw new DatosInvalidos('Indica el barbero, o null para bloquear todo el negocio');
  }
  if (soloBarbero !== null && entrada.profesionalId !== undefined && entrada.profesionalId !== soloBarbero) {
    throw new Prohibido();
  }
  const profesionalId = soloBarbero ?? entrada.profesionalId ?? null;
  res.status(201).json(await servicio.crearBloqueo(negocioId, { ...entrada, profesionalId }));
});

rutasBloqueos.delete('/:id', async (req, res) => {
  const negocioId = negocioDeSesion(req);
  const soloBarbero = await alcanceDeBloqueos(req);
  await servicio.eliminarBloqueo(negocioId, String(req.params.id), soloBarbero);
  res.status(204).end();
});
