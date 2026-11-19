import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { DemasiadasPeticiones, DemasiadosIntentos, ErrorDominio } from './compartido/errores.js';
import { limitar, porIp, type Limite } from './compartido/limite.js';
import { logger } from './compartido/logger.js';
import { entorno } from './config/entorno.js';
import { pool } from './db/pool.js';
import { crearRutasAuth, type LimitesAuth } from './modulos/auth/auth.rutas.js';
import { rutasCitas } from './modulos/citas/citas.rutas.js';
import { rutasClientes } from './modulos/clientes/clientes.rutas.js';
import { rutasConocimiento } from './modulos/conocimiento/conocimiento.rutas.js';
import { crearRutasConversaciones } from './modulos/conversaciones/conversaciones.rutas.js';
import type { DependenciasEnvio } from './modulos/whatsapp/whatsapp.envio.js';
import { rutasMiNegocio, rutasNegocios } from './modulos/negocios/negocios.rutas.js';
import { rutasBloqueos } from './modulos/profesionales/agenda.rutas.js';
import { rutasProfesionales } from './modulos/profesionales/profesionales.rutas.js';
import { rutasConsumo } from './modulos/uso/consumo.rutas.js';
import { crearRutasWhatsapp } from './modulos/whatsapp/whatsapp.rutas.js';
import type { ConfiguracionWebhook } from './modulos/whatsapp/whatsapp.tipos.js';

const MINUTO = 60_000;

/** Límites de peticiones. Holgados para una persona; solo frenan a un bot. */
export interface Limites extends LimitesAuth {
  /** Todas las rutas menos el webhook, por IP. El panel reenvía la IP de quien navega. */
  global: Limite;
  /** Eventos firmados del webhook de WhatsApp, en total. */
  webhook: Limite;
}

export const LIMITES: Limites = {
  global: { ventanaMs: MINUTO, maximo: 300 },
  publicas: { ventanaMs: 15 * MINUTO, maximo: 20 },
  contrasena: { ventanaMs: 15 * MINUTO, maximo: 10 },
  enlaces: { ventanaMs: 60 * MINUTO, maximo: 30 },
  webhook: { ventanaMs: MINUTO, maximo: 600 },
};

interface OpcionesApp {
  saltosProxy?: number;
  whatsapp?: ConfiguracionWebhook;
  /** Solo en pruebas: reemplaza la llamada a Meta cuando el dueño responde una conversación. */
  envio?: DependenciasEnvio;
  /** Para pruebas: cambia uno o más límites de peticiones. */
  limites?: Partial<Limites>;
}

export function crearApp({
  saltosProxy = entorno.SALTOS_PROXY,
  whatsapp = { appSecret: entorno.WHATSAPP_APP_SECRET, verifyToken: entorno.WHATSAPP_VERIFY_TOKEN },
  envio = {},
  limites: cambiosDeLimites = {},
}: OpcionesApp = {}) {
  const limites = { ...LIMITES, ...cambiosDeLimites };
  const app = express();
  app.disable('x-powered-by');
  // Define de dónde sale req.ip, que usan el límite de intentos de login y el de peticiones.
  app.set('trust proxy', saltosProxy);

  // IMPORTANTE: el webhook de WhatsApp necesita el cuerpo SIN procesar para
  // verificar la firma de Meta. Por eso va ANTES de express.json().
  app.use('/webhooks/whatsapp', crearRutasWhatsapp({ limiteEventos: limites.webhook, ...whatsapp }));
  // Después del webhook: Meta no debe gastar el cupo de una IP, y su límite es otro.
  app.use(limitar(limites.global, porIp));
  app.use(express.json({ limit: '100kb' }));

  // Comprobación de que la API y la base de datos responden.
  app.get('/salud', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ estado: 'ok' });
  });

  // Rutas de cada módulo.
  app.use('/auth', crearRutasAuth(limites));
  app.use('/citas', rutasCitas);
  app.use('/clientes', rutasClientes);
  app.use('/conocimiento', rutasConocimiento);
  app.use('/conversaciones', crearRutasConversaciones(envio));
  app.use('/negocios', rutasNegocios);
  app.use('/negocio', rutasMiNegocio);
  app.use('/profesionales', rutasProfesionales);
  app.use('/bloqueos', rutasBloqueos);
  app.use('/consumo', rutasConsumo);

  app.use((_req, res) => {
    res.status(404).json({
      error: { codigo: 'RUTA_NO_ENCONTRADA', mensaje: 'La ruta no existe' },
    });
  });
  app.use(manejarErrores);

  return app;
}

/** Único lugar donde los errores se convierten en respuestas HTTP. */
function manejarErrores(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ErrorDominio) {
    if (error instanceof DemasiadosIntentos || error instanceof DemasiadasPeticiones) res.set('Retry-After', String(error.reintentarEnSegundos));
    res.status(error.estadoHttp).json({
      error: { codigo: error.codigo, mensaje: error.message },
    });
    return;
  }
  // Errores del cliente que Express detecta solo (JSON malformado, cuerpo demasiado grande).
  if (esErrorDeCliente(error)) {
    const estado = error.status === 413 ? 413 : 400;
    res.status(estado).json({
      error: {
        codigo: estado === 413 ? 'CUERPO_DEMASIADO_GRANDE' : 'DATOS_INVALIDOS',
        mensaje:
          estado === 413
            ? 'El cuerpo de la petición es demasiado grande'
            : 'El cuerpo de la petición no es válido',
      },
    });
    return;
  }
  logger.error({ err: error }, 'Error inesperado');
  res.status(500).json({
    error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' },
  });
}

function esErrorDeCliente(error: unknown): error is { status: number } {
  if (typeof error !== 'object' || error === null || !('status' in error)) return false;
  const { status } = error as { status: unknown };
  return typeof status === 'number' && status >= 400 && status < 500;
}
