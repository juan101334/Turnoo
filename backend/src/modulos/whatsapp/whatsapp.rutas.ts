import express, { Router } from 'express';
import { NoAutorizado } from '../../compartido/errores.js';
import { logger } from '../../compartido/logger.js';
import { enviarAvisoDeDatos } from './whatsapp.aviso.js';
import { firmaValida, textosIguales } from './whatsapp.firma.js';
import { procesarEvento } from './whatsapp.servicio.js';
import type { ConfiguracionWebhook } from './whatsapp.tipos.js';

const LIMITE_CUERPO = '3mb';

/** Webhook de Meta. No lleva sesión: lo que prueba el origen es la firma o el token de verificación. */
export function crearRutasWhatsapp({ appSecret, verifyToken, pedir }: ConfiguracionWebhook) {
  const rutas = Router();

  // Meta comprueba la URL al configurarla: hay que devolverle su `challenge` tal cual, en texto plano.
  rutas.get('/', (req, res) => {
    const token = req.query['hub.verify_token'];
    const reto = req.query['hub.challenge'];
    const valido =
      verifyToken !== '' &&
      req.query['hub.mode'] === 'subscribe' &&
      typeof token === 'string' &&
      textosIguales(token, verifyToken) &&
      typeof reto === 'string';
    if (!valido) {
      res.status(403).json({ error: { codigo: 'PROHIBIDO', mensaje: 'Verificación rechazada' } });
      return;
    }
    res.type('text/plain').send(reto);
  });

  // Cuerpo sin procesar y de cualquier tipo: la firma se calcula sobre los bytes exactos.
  rutas.post('/', express.raw({ type: () => true, limit: LIMITE_CUERPO }), async (req, res) => {
    if (!appSecret) {
      // Error reintentable: Meta volverá a enviarlo, y el mensaje no se pierde mientras se configura.
      logger.error('Webhook de WhatsApp sin WHATSAPP_APP_SECRET: se rechaza todo');
      res.status(503).json({ error: { codigo: 'NO_CONFIGURADO', mensaje: 'El webhook no está configurado' } });
      return;
    }
    if (!Buffer.isBuffer(req.body) || !firmaValida(req.body, req.get('x-hub-signature-256'), appSecret)) {
      throw new NoAutorizado('Firma no válida');
    }

    let datos: unknown;
    try {
      datos = JSON.parse(req.body.toString('utf8'));
    } catch {
      // La firma es válida: reenviar el mismo cuerpo no lo arreglaría.
      logger.warn('Webhook de WhatsApp con un cuerpo que no es JSON');
      res.status(200).end();
      return;
    }

    const { fallidos, avisos } = await procesarEvento(datos);
    if (fallidos > 0) {
      res.status(500).json({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' } });
    } else {
      res.status(200).end();
    }
    // Después de responder, para no hacer esperar a Meta. Lo guardado ya está a salvo; si un aviso
    // falla, se reintenta con el siguiente mensaje del cliente. Nunca lanza.
    for (const aviso of avisos) await enviarAvisoDeDatos(aviso, pedir ? { pedir } : {});
  });

  return rutas;
}
