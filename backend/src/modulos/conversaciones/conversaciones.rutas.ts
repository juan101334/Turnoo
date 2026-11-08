import { Router } from 'express';
import { z } from 'zod';
import { validarEsquema } from '../../compartido/validacion.js';
import { exigirRol, exigirSesion, negocioDeSesion } from '../auth/auth.middleware.js';
import type { DependenciasEnvio } from '../whatsapp/whatsapp.envio.js';
import * as servicio from './conversaciones.servicio.js';

/**
 * Conversaciones de WhatsApp para el panel: leer y responder como persona del negocio. Solo el
 * dueño, porque una conversación no pertenece a un barbero. El superadmin no entra.
 * `envio` solo se indica en pruebas, para no llamar a Meta.
 */
export function crearRutasConversaciones(envio: DependenciasEnvio = {}) {
  const rutas = Router();
  rutas.use(exigirSesion, exigirRol('dueno'));

  rutas.get('/', async (req, res) => {
    const q = validarEsquema(
      z.strictObject({
        estado: z.enum(['bot', 'humano']).optional(),
        limite: z.coerce.number().int().min(1).max(servicio.MAX_CONVERSACIONES_PANEL).default(50),
      }),
      req.query,
    );
    res.json({ conversaciones: await servicio.listarConversaciones(negocioDeSesion(req), q.estado ?? null, q.limite) });
  });

  rutas.get('/:id', async (req, res) => {
    res.json(await servicio.obtenerConversacion(negocioDeSesion(req), String(req.params.id)));
  });

  rutas.get('/:id/mensajes', async (req, res) => {
    const q = validarEsquema(
      z.strictObject({ limite: z.coerce.number().int().min(1).max(servicio.MAX_MENSAJES_PANEL).default(50) }),
      req.query,
    );
    res.json({ mensajes: await servicio.mensajesDeConversacion(negocioDeSesion(req), String(req.params.id), q.limite) });
  });

  rutas.post('/:id/mensajes', async (req, res) => {
    const { texto } = validarEsquema(z.strictObject({ texto: z.string().max(5_000) }), req.body);
    const resultado = await servicio.responderComoNegocio(negocioDeSesion(req), String(req.params.id), texto, new Date(), envio);
    // Meta lo rechazó: el mensaje quedó guardado como fallido y la persona puede reintentar.
    res.status(resultado.estado === 'enviado' ? 201 : 502).json(resultado);
  });

  return rutas;
}
