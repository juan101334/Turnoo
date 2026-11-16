import { Router } from 'express';
import { z } from 'zod';
import { validarEsquema } from '../../compartido/validacion.js';
import { exigirRol, exigirSesion } from '../auth/auth.middleware.js';
import * as servicio from './consumo.servicio.js';

/** Panel de consumo de la plataforma: solo el superadmin, solo lectura y solo agregados. */
export const rutasConsumo = Router();
rutasConsumo.use(exigirSesion, exigirRol('superadmin'));

const consulta = z.strictObject({
  mes: z
    .string()
    .regex(/^20\d{2}-(0[1-9]|1[0-2])$/, 'Debe ser un mes con formato AAAA-MM')
    .optional(),
});

rutasConsumo.get('/', async (req, res) => {
  res.json(await servicio.resumenDeConsumo(validarEsquema(consulta, req.query).mes));
});

rutasConsumo.get('/negocios', async (req, res) => {
  res.json(await servicio.consumoPorNegocio(validarEsquema(consulta, req.query).mes));
});

rutasConsumo.get('/negocios/:id', async (req, res) => {
  res.json(await servicio.consumoDeNegocio(String(req.params.id), validarEsquema(consulta, req.query).mes));
});
