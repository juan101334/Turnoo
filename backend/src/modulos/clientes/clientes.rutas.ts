import { Router, type Request } from 'express';
import { z } from 'zod';
import { Prohibido } from '../../compartido/errores.js';
import { validarEsquema } from '../../compartido/validacion.js';
import { exigirRol, exigirSesion, negocioDeSesion, usuarioDe } from '../auth/auth.middleware.js';
import { profesionalDelUsuario } from '../profesionales/profesionales.servicio.js';
import * as servicio from './clientes.servicio.js';

/**
 * Clientes para el panel. El dueño ve todo el negocio; el empleado, solo los clientes con citas
 * de SU barbero. Únicamente el dueño edita o anonimiza. Se crean al agendar, en POST /citas.
 */
export const rutasClientes = Router();
rutasClientes.use(exigirSesion, exigirRol('dueno', 'empleado'));

/** null = todo el negocio (dueño). Con valor = solo ese barbero (empleado). */
async function barberoDelAlcance(req: Request): Promise<string | null> {
  const usuario = usuarioDe(req);
  if (usuario.rol === 'dueno') return null;
  const propio = await profesionalDelUsuario(negocioDeSesion(req), usuario.usuarioId);
  if (!propio) throw new Prohibido('Tu usuario no está asociado a un barbero');
  return propio.id;
}

rutasClientes.get('/', async (req, res) => {
  const profesionalId = await barberoDelAlcance(req);
  const q = validarEsquema(
    z.strictObject({
      buscar: z.string().max(100).optional(),
      limite: z.coerce.number().int().min(1).max(100).default(50),
      desplazamiento: z.coerce.number().int().min(0).max(1_000_000).default(0),
    }),
    req.query,
  );
  res.json(
    await servicio.listarClientes(negocioDeSesion(req), {
      profesionalId,
      buscar: q.buscar ?? null,
      limite: q.limite,
      desplazamiento: q.desplazamiento,
    }),
  );
});

rutasClientes.get('/:id', async (req, res) => {
  const profesionalId = await barberoDelAlcance(req);
  res.json(await servicio.obtenerCliente(negocioDeSesion(req), String(req.params.id), profesionalId));
});

rutasClientes.patch('/:id', exigirRol('dueno'), async (req, res) => {
  const entrada = validarEsquema(
    z.strictObject({
      nombre: z.string().max(1000).nullable().optional(),
      telefono: z.string().max(30).optional(),
      notas: z.string().max(10_000).nullable().optional(),
    }),
    req.body,
  );
  res.json(await servicio.actualizarCliente(negocioDeSesion(req), String(req.params.id), entrada));
});

rutasClientes.post('/:id/anonimizar', exigirRol('dueno'), async (req, res) => {
  await servicio.anonimizarCliente(negocioDeSesion(req), String(req.params.id));
  res.status(204).end();
});
