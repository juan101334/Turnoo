import { crearApp } from './app.js';
import { logger } from './compartido/logger.js';
import { entorno } from './config/entorno.js';
import { pool } from './db/pool.js';
import { crearAtender } from './modulos/ia/ia.servicio.js';
import { iniciarProcesador } from './procesador/procesador.js';
import { iniciarTareas } from './tareas/programador.js';

const app = crearApp();

const servidor = app.listen(entorno.PORT, () => {
  logger.info(`Turnoo backend escuchando en el puerto ${entorno.PORT}`);
});

const tareas = iniciarTareas();

// Sin clave de OpenAI la IA no responde: el webhook guarda los mensajes, pero nadie los atiende.
const procesador = entorno.OPENAI_API_KEY ? iniciarProcesador({ atender: crearAtender() }) : null;
if (procesador) logger.info({ modelo: entorno.OPENAI_MODELO }, 'IA activa');
else logger.warn('Falta OPENAI_API_KEY: la IA no responderá por WhatsApp');

function apagar(senal: string) {
  logger.info({ senal }, 'Apagando el servidor…');
  const servidorCerrado = new Promise((resolver) => servidor.close(resolver));
  void Promise.all([servidorCerrado, tareas.detener(), procesador?.detener()])
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
