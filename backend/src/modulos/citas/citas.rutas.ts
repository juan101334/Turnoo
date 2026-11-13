import { Router, type Request } from 'express';
import { z } from 'zod';
import { DatosInvalidos, NoEncontrado, Prohibido } from '../../compartido/errores.js';
import { instanteIso as instante, validarEsquema } from '../../compartido/validacion.js';
import { exigirRol, exigirSesion, usuarioDe } from '../auth/auth.middleware.js';
import { obtenerOCrearCliente } from '../clientes/clientes.servicio.js';
import { imagenesDeCita, leerImagenDeCita } from '../adjuntos/adjuntos.servicio.js';
import * as servicio from './citas.servicio.js';
import type { EstadoCita } from './citas.tipos.js';

/**
 * Citas para el panel. Solo dueño y empleado. El dueño ve y maneja todo el negocio;
 * el empleado, únicamente las citas de SU barbero (profesionales.usuario_id).
 */
export const rutasCitas = Router();
rutasCitas.use(exigirSesion, exigirRol('dueno', 'empleado'));

const estado = z.enum(['por_aprobar', 'pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio']);

interface Alcance {
  negocioId: string;
  usuarioId: string;
  /** null = todo el negocio (dueño). Con valor = solo ese barbero (empleado). */
  profesionalId: string | null;
}

async function alcanceDe(req: Request): Promise<Alcance> {
  const u = usuarioDe(req);
  if (!u.negocioId) throw new Prohibido();
  if (u.rol === 'dueno') return { negocioId: u.negocioId, usuarioId: u.usuarioId, profesionalId: null };
  const profesionalId = await servicio.profesionalDeUsuario(u.negocioId, u.usuarioId);
  if (!profesionalId) throw new Prohibido('Tu usuario no está asociado a un barbero');
  return { negocioId: u.negocioId, usuarioId: u.usuarioId, profesionalId };
}

/** Barbero sobre el que se actúa: el empleado solo puede el suyo; el dueño indica cuál (si hace falta). */
function barberoPermitido(a: Alcance, pedido: string | undefined): string | undefined {
  if (!a.profesionalId) return pedido;
  if (pedido !== undefined && pedido !== a.profesionalId) throw new Prohibido();
  return a.profesionalId;
}

/** La cita, si el usuario puede verla. Una cita ajena se responde como "no existe". */
async function citaVisible(a: Alcance, citaId: string) {
  const cita = await servicio.obtenerCita(a.negocioId, citaId);
  if (a.profesionalId && cita.profesionalId !== a.profesionalId) throw new NoEncontrado('La cita');
  return cita;
}

rutasCitas.get('/disponibilidad', async (req, res) => {
  const a = await alcanceDe(req);
  const q = validarEsquema(
    z.object({
      profesionalId: z.string().optional(),
      servicioIds: z.string().min(1, 'Indica al menos un servicio'),
      desde: z.string(),
      hasta: z.string(),
    }),
    req.query,
  );
  const profesionalId = barberoPermitido(a, q.profesionalId);
  if (!profesionalId) throw new DatosInvalidos('Debes indicar el barbero');
  res.json(
    await servicio.consultarDisponibilidad(a.negocioId, {
      profesionalId,
      servicioIds: q.servicioIds.split(','),
      desde: q.desde,
      hasta: q.hasta,
    }),
  );
});

rutasCitas.get('/', async (req, res) => {
  const a = await alcanceDe(req);
  const q = validarEsquema(
    z.object({
      desde: instante,
      hasta: instante,
      profesionalId: z.string().optional(),
      estado: z.string().optional(),
      /** "historial": cada cita trae cuántas completó el cliente y cuántas veces no vino. */
      incluir: z.literal('historial').optional(),
    }),
    req.query,
  );
  const estados = q.estado ? validarEsquema(z.array(estado), q.estado.split(',')) : undefined;
  const profesionalId = barberoPermitido(a, q.profesionalId);
  const citas = await servicio.listarCitas(a.negocioId, {
    desde: q.desde,
    hasta: q.hasta,
    ...(profesionalId && { profesionalId }),
    ...(estados && { estados: estados as EstadoCita[] }),
    // El empleado solo cuenta lo que el cliente hizo con su barbero; el dueño, todo el negocio
    // (aunque filtre la lista por un barbero).
    ...(q.incluir === 'historial' && { historial: { profesionalId: a.profesionalId } }),
  });
  res.json({ citas });
});

/**
 * Cuántas citas hay cada día (fechas locales del negocio, ambas incluidas): los puntos bajo los
 * días del calendario. El empleado cuenta solo las de su barbero.
 */
rutasCitas.get('/conteo', async (req, res) => {
  const a = await alcanceDe(req);
  const q = validarEsquema(
    z.object({ desde: z.string(), hasta: z.string(), profesionalId: z.string().optional() }),
    req.query,
  );
  const profesionalId = barberoPermitido(a, q.profesionalId);
  res.json(
    await servicio.contarCitasPorDia(a.negocioId, {
      desde: q.desde,
      hasta: q.hasta,
      ...(profesionalId && { profesionalId }),
    }),
  );
});

rutasCitas.get('/:id', async (req, res) => {
  const a = await alcanceDe(req);
  res.json(await citaVisible(a, String(req.params.id)));
});

/** Imágenes que envió el cliente por WhatsApp y quedaron adjuntas a la cita. */
rutasCitas.get('/:id/imagenes', async (req, res) => {
  const a = await alcanceDe(req);
  const cita = await citaVisible(a, String(req.params.id));
  res.json({ imagenes: await imagenesDeCita(a.negocioId, cita.id) });
});

rutasCitas.get('/:id/imagenes/:imagenId', async (req, res) => {
  const a = await alcanceDe(req);
  const cita = await citaVisible(a, String(req.params.id));
  const { bytes, mimeType } = await leerImagenDeCita(a.negocioId, cita.id, String(req.params.imagenId));
  // Datos personales: ningún intermediario la guarda, y el navegador no adivina otro tipo.
  res.set({ 'Content-Type': mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  res.send(bytes);
});

rutasCitas.post('/', async (req, res) => {
  const a = await alcanceDe(req);
  const c = validarEsquema(
    z.object({
      profesionalId: z.string().optional(),
      servicioIds: z.array(z.string()).min(1).max(10),
      inicio: instante,
      cliente: z.object({ telefono: z.string().max(30), nombre: z.string().max(100).optional() }),
      notas: z.string().max(500).optional(),
    }),
    req.body,
  );
  const profesionalId = barberoPermitido(a, c.profesionalId);
  if (!profesionalId) throw new DatosInvalidos('Debes indicar el barbero');

  const cliente = await obtenerOCrearCliente(a.negocioId, c.cliente);
  const cita = await servicio.crearCita(a.negocioId, {
    profesionalId,
    clienteId: cliente.id,
    servicioIds: c.servicioIds,
    inicio: c.inicio,
    ...(c.notas && { notas: c.notas }),
    origen: 'panel',
    creadaPorUsuarioId: a.usuarioId,
  });
  res.status(201).json(await servicio.obtenerCita(a.negocioId, cita.id));
});

/** Acciones sobre una cita: primero se comprueba que el usuario puede verla, luego se ejecuta. */
function accion(ruta: string, ejecutar: (a: Alcance, citaId: string, cuerpo: unknown) => Promise<unknown>) {
  rutasCitas.post(`/:id/${ruta}`, async (req, res) => {
    const a = await alcanceDe(req);
    const citaId = String(req.params.id);
    await citaVisible(a, citaId);
    await ejecutar(a, citaId, req.body ?? {});
    res.json(await servicio.obtenerCita(a.negocioId, citaId));
  });
}

accion('cancelar', (a, id) => servicio.cancelarCita(a.negocioId, id, { tipo: 'negocio' }));
accion('aprobar', (a, id) => servicio.aprobarCita(a.negocioId, id));
accion('rechazar', (a, id) => servicio.rechazarCita(a.negocioId, id));
accion('reprogramar', (a, id, cuerpo) => {
  const { inicio } = validarEsquema(z.object({ inicio: instante }), cuerpo);
  return servicio.reprogramarCita(a.negocioId, id, inicio, { tipo: 'negocio' });
});
accion('marcar', (a, id, cuerpo) => {
  const { estado: nuevo } = validarEsquema(z.object({ estado: z.enum(['completada', 'no_asistio']) }), cuerpo);
  return servicio.marcarCita(a.negocioId, id, nuevo);
});
