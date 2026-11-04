import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { ErrorDominio } from './compartido/errores.js';
import { logger } from './compartido/logger.js';
import { pool } from './db/pool.js';
import { rutasAuth } from './modulos/auth/auth.rutas.js';
import { rutasCitas } from './modulos/citas/citas.rutas.js';
import { rutasMiNegocio, rutasNegocios } from './modulos/negocios/negocios.rutas.js';

export function crearApp() {
  const app = express();
  app.disable('x-powered-by');

  // IMPORTANTE: el webhook de WhatsApp necesita el cuerpo SIN procesar para
  // verificar la firma de Meta. Cuando exista, su router se registra ANTES de
  // la siguiente línea, con su propio express.raw().
  app.use(express.json({ limit: '100kb' }));

  // Comprobación de que la API y la base de datos responden.
  app.get('/salud', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ estado: 'ok' });
  });

  // Rutas de cada módulo.
  app.use('/auth', rutasAuth);
  app.use('/citas', rutasCitas);
  app.use('/negocios', rutasNegocios);
  app.use('/negocio', rutasMiNegocio);

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
