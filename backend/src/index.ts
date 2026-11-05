import { crearApp } from './app.js';
import { logger } from './compartido/logger.js';
import { entorno } from './config/entorno.js';
import { pool } from './db/pool.js';
import { iniciarTareas } from './tareas/programador.js';

const app = crearApp();

const servidor = app.listen(entorno.PORT, () => {
  logger.info(`Turnoo backend escuchando en el puerto ${entorno.PORT}`);
});

const tareas = iniciarTareas();

function apagar(senal: string) {
  logger.info({ senal }, 'Apagando el servidor…');
  const servidorCerrado = new Promise((resolver) => servidor.close(resolver));
  void Promise.all([servidorCerrado, tareas.detener()])
    .then(() => pool.end())
    .then(() => process.exit(0));
  // Si algo queda colgado, se fuerza el cierre pasados 10 segundos.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('unhandledRejection', (motivo) => {
  logger.fatal({ err: motivo }, 'Promesa rechazada sin manejar');
  process.exit(1);
});
