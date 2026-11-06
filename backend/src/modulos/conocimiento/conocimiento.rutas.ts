import { Router } from 'express';
import { z } from 'zod';
import { validarEsquema } from '../../compartido/validacion.js';
import { exigirRol, exigirSesion, negocioDeSesion } from '../auth/auth.middleware.js';
import * as servicio from './conocimiento.servicio.js';

/**
 * Base de conocimiento de la IA. Solo el dueño la ve y la cambia: es lo que la IA dice en nombre
 * del negocio. El superadmin no entra, igual que con barberos y clientes.
 *
 * Los largos exactos los revisa el servicio, después de quitar espacios; aquí solo se corta lo
 * que es claramente demasiado para no procesar cuerpos enormes.
 */
export const rutasConocimiento = Router();
rutasConocimiento.use(exigirSesion, exigirRol('dueno'));

const texto = z.string().max(10_000);

rutasConocimiento.get('/', async (req, res) => {
  res.json(await servicio.listarConocimiento(negocioDeSesion(req)));
});

rutasConocimiento.post('/', async (req, res) => {
  const entrada = validarEsquema(
    z.strictObject({ pregunta: texto, respuesta: texto, activo: z.boolean().optional() }),
    req.body,
  );
  res.status(201).json(await servicio.crearEntrada(negocioDeSesion(req), entrada));
});

rutasConocimiento.patch('/:id', async (req, res) => {
  const cambios = validarEsquema(
    z.strictObject({ pregunta: texto.optional(), respuesta: texto.optional(), activo: z.boolean().optional() }),
    req.body,
  );
  res.json(await servicio.actualizarEntrada(negocioDeSesion(req), String(req.params.id), cambios));
});

rutasConocimiento.delete('/:id', async (req, res) => {
  await servicio.borrarEntrada(negocioDeSesion(req), String(req.params.id));
  res.status(204).end();
});
