import { Router, type Request } from 'express';
import { z } from 'zod';
import { NoEncontrado } from '../../compartido/errores.js';
import { validarEsquema } from '../../compartido/validacion.js';
import { exigirRol, exigirSesion, negocioDeSesion as negocioDe, usuarioDe } from '../auth/auth.middleware.js';
import { rutasAgendaDelBarbero } from './agenda.rutas.js';
import * as servicio from './profesionales.servicio.js';
import type { Profesional } from './profesionales.tipos.js';

/**
 * Barberos. El dueño administra todos; el empleado solo consulta el suyo.
 * El superadmin no entra: no opera barberos ni agenda.
 */
export const rutasProfesionales = Router();
rutasProfesionales.use(exigirSesion, exigirRol('dueno', 'empleado'));

const soloDueno = exigirRol('dueno');
const nombre = z.strictObject({ nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(100) });

async function barberoDelEmpleado(req: Request): Promise<Profesional | null> {
  return servicio.profesionalDelUsuario(negocioDe(req), usuarioDe(req).usuarioId);
}

rutasProfesionales.use('/:id', rutasAgendaDelBarbero);

rutasProfesionales.get('/', async (req, res) => {
  if (usuarioDe(req).rol === 'dueno') {
    res.json({ profesionales: await servicio.listarProfesionales(negocioDe(req)) });
    return;
  }
  const propio = await barberoDelEmpleado(req);
  res.json({ profesionales: propio ? [propio] : [] });
});

rutasProfesionales.get('/:id', async (req, res) => {
  const id = String(req.params.id);
  if (usuarioDe(req).rol === 'dueno') {
    res.json(await servicio.obtenerProfesional(negocioDe(req), id));
    return;
  }
  // Un barbero ajeno se responde como "no existe", igual que una cita ajena.
  const propio = await barberoDelEmpleado(req);
  if (propio?.id !== id) throw new NoEncontrado('El barbero');
  res.json(propio);
});

rutasProfesionales.post('/', soloDueno, async (req, res) => {
  const entrada = validarEsquema(nombre, req.body);
  res.status(201).json(await servicio.crearProfesional(negocioDe(req), entrada.nombre));
});

rutasProfesionales.patch('/:id', soloDueno, async (req, res) => {
  const entrada = validarEsquema(nombre, req.body);
  res.json(await servicio.renombrarProfesional(negocioDe(req), String(req.params.id), entrada.nombre));
});

rutasProfesionales.post('/:id/desactivar', soloDueno, async (req, res) => {
  res.json(await servicio.desactivarProfesional(negocioDe(req), String(req.params.id)));
});

rutasProfesionales.post('/:id/activar', soloDueno, async (req, res) => {
  res.json(await servicio.activarProfesional(negocioDe(req), String(req.params.id)));
});

rutasProfesionales.put('/:id/usuario', soloDueno, async (req, res) => {
  const { usuarioId } = validarEsquema(z.strictObject({ usuarioId: z.string().nullable() }), req.body);
  res.json(await servicio.asignarUsuario(negocioDe(req), String(req.params.id), usuarioId));
});
