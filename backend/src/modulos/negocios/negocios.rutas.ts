import { Router, type Request } from 'express';
import { z } from 'zod';
import { Prohibido } from '../../compartido/errores.js';
import { validarEsquema } from '../../compartido/validacion.js';
import { exigirRol, exigirSesion, usuarioDe } from '../auth/auth.middleware.js';
import * as servicio from './negocios.servicio.js';

const nombre = z.string().trim().min(1, 'El nombre es obligatorio').max(100);
const zonaHoraria = z.string().max(64);
const telefono = z.string().max(30).nullable();
const planId = z.string().nullable();

// Objetos estrictos: un campo que no está en la lista (por ejemplo, un dueño enviando
// "estado" o "planId") se rechaza en vez de ignorarse en silencio.

/** Administración de la plataforma: solo el superadmin, que no opera barberos ni agenda. */
export const rutasNegocios = Router();
rutasNegocios.use(exigirSesion, exigirRol('superadmin'));

rutasNegocios.post('/', async (req, res) => {
  const entrada = validarEsquema(
    z.strictObject({
      nombre,
      zonaHoraria: zonaHoraria.optional(),
      telefonoAvisos: telefono.optional(),
      planId: planId.optional(),
    }),
    req.body,
  );
  res.status(201).json(await servicio.crearNegocio(entrada));
});

rutasNegocios.get('/', async (_req, res) => {
  res.json({ negocios: await servicio.listarNegocios() });
});

rutasNegocios.get('/:id', async (req, res) => {
  res.json(await servicio.obtenerNegocio(String(req.params.id)));
});

rutasNegocios.patch('/:id', async (req, res) => {
  const cambios = validarEsquema(
    z.strictObject({
      planId: planId.optional(),
      estado: z.enum(['prueba', 'activo', 'suspendido']).optional(),
    }),
    req.body,
  );
  res.json(await servicio.cambiarPlanYEstado(String(req.params.id), cambios));
});

/** El negocio de quien hace la petición: el id sale de la sesión, nunca de la URL. */
export const rutasMiNegocio = Router();
rutasMiNegocio.use(exigirSesion, exigirRol('dueno'));

function negocioDe(req: Request): string {
  const { negocioId } = usuarioDe(req);
  if (!negocioId) throw new Prohibido();
  return negocioId;
}

rutasMiNegocio.get('/', async (req, res) => {
  res.json(await servicio.obtenerMiNegocio(negocioDe(req)));
});

rutasMiNegocio.patch('/', async (req, res) => {
  const cambios = validarEsquema(
    z.strictObject({
      nombre: nombre.optional(),
      telefonoAvisos: telefono.optional(),
      zonaHoraria: zonaHoraria.optional(),
    }),
    req.body,
  );
  res.json(await servicio.actualizarMiNegocio(negocioDe(req), cambios));
});

const horaLocal = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Debe ser una hora HH:MM');
const entero = (minimo: number, maximo: number) => z.number().int().min(minimo).max(maximo);

// Los rangos cubren los CHECK de la base y fijan un tope razonable, para que un valor
// fuera de rango responda 400 y no llegue a PostgreSQL como un error interno.
const cambiosConfiguracion = z.strictObject({
  intervaloMinutos: z.union([5, 10, 15, 20, 30, 60].map((m) => z.literal(m))).optional(),
  anticipacionMinMinutos: entero(0, 43_200).optional(),
  anticipacionMaxDias: entero(1, 365).optional(),
  maxCitasActivasCliente: entero(1, 100).nullable().optional(),
  horasLimiteCancelacion: entero(0, 720).optional(),
  horasRecordatorio: entero(1, 168).optional(),
  recordatorioNoAntesDe: horaLocal.optional(),
  recordatorioNoDespuesDe: horaLocal.optional(),
  maxInasistencias: entero(1, 100).optional(),
  ventanaInasistenciasDias: entero(1, 365).optional(),
  horasEsperaAprobacion: entero(1, 168).optional(),
  aprobacionMinutosAntesCita: entero(0, 10_080).optional(),
  horasModoHumano: entero(1, 168).optional(),
  horasAutocompletarCita: entero(1, 720).optional(),
});

rutasMiNegocio.patch('/configuracion', async (req, res) => {
  const cambios = validarEsquema(cambiosConfiguracion, req.body);
  res.json(await servicio.actualizarConfiguracion(negocioDe(req), cambios));
});
