import { logger } from '../../compartido/logger.js';
import { fechaLocal, horaLocal } from '../../compartido/tiempo.js';
import type { Atender, ConversacionPendiente } from '../../procesador/procesador.js';
import { citasActivasDelCliente } from '../citas/citas.servicio.js';
import { conocimientoActivo } from '../conocimiento/conocimiento.servicio.js';
import type { MensajeDelHistorial } from '../conversaciones/conversaciones.tipos.js';
import { contextoDeConversacion } from '../conversaciones/conversaciones.servicio.js';
import { enviarMensaje, MAX_TEXTO, type DependenciasEnvio } from '../whatsapp/whatsapp.envio.js';
import { ejecutarHerramienta, HERRAMIENTAS } from './ia.herramientas.js';
import { armarInstrucciones } from './ia.instrucciones.js';
import { ErrorDelModelo, llamarModelo, type DependenciasModelo, type ItemEntrada, type UsoDeTokens } from './ia.proveedor.js';

/**
 * Atiende una conversación pendiente: arma el contexto, deja que el modelo use sus funciones y
 * envía la respuesta final por WhatsApp.
 *
 * Tolera reintentos (el procesador vuelve a llamar si algo falla):
 * - Todo se vuelve a leer de la base en cada intento, incluidas las citas activas del cliente, que
 *   van en las instrucciones. Si el intento anterior ya creó la cita, el modelo la ve.
 * - crear_cita devuelve la cita existente si ya hay una igual (mismo barbero y misma hora).
 * - El texto se envía al final: si falla algo antes, el cliente no recibe nada a medias.
 */

/** Llamadas al modelo por atención. Cada función pedida cuesta una llamada más. */
export const MAX_LLAMADAS = 6;

const DESCRIPCION_ADJUNTO: Record<string, string> = {
  audio: '[El cliente envió un audio. Todavía no puedes escucharlo.]',
  imagen: '[El cliente envió una imagen. Todavía no puedes verla.]',
  plantilla: '[Mensaje automático de la barbería.]',
  otro: '[El cliente envió un mensaje que no es texto.]',
};

/** El historial como mensajes para el modelo. Nada del cliente va en las instrucciones. */
export function historialComoEntrada(historial: MensajeDelHistorial[]): ItemEntrada[] {
  return historial.map((m) => ({
    role: m.autor === 'cliente' ? 'user' : 'assistant',
    content: (m.tipo === 'texto' ? m.contenido : null) ?? DESCRIPCION_ADJUNTO[m.tipo] ?? DESCRIPCION_ADJUNTO.otro!,
  }));
}

export interface DependenciasIA {
  modelo?: DependenciasModelo;
  envio?: DependenciasEnvio;
  reloj?: () => Date;
}

const sumar = (a: UsoDeTokens, b: UsoDeTokens): UsoDeTokens => ({
  entrada: a.entrada + b.entrada,
  entradaEnCache: a.entradaEnCache + b.entradaEnCache,
  salida: a.salida + b.salida,
  razonamiento: a.razonamiento + b.razonamiento,
});

export function crearAtender({ modelo = {}, envio = {}, reloj = () => new Date() }: DependenciasIA = {}): Atender {
  return async ({ negocioId, conversacionId, clienteId }: ConversacionPendiente) => {
    const ahora = reloj();
    const [contexto, conocimiento, activas] = await Promise.all([
      contextoDeConversacion(negocioId, conversacionId),
      conocimientoActivo(negocioId),
      citasActivasDelCliente(negocioId, clienteId, ahora),
    ]);
    const zona = contexto.negocio.zonaHoraria;
    const instrucciones = armarInstrucciones({
      contexto,
      conocimiento,
      ahora,
      citas: activas.map((c) => ({
        id: c.id,
        fecha: fechaLocal(c.inicio, zona),
        hora: horaLocal(c.inicio, zona),
        barbero: c.profesionalNombre,
        servicios: c.servicios.map((s) => s.nombre),
        estado: c.estado,
      })),
    });

    const entrada = historialComoEntrada(contexto.historial);
    const herramienta = { negocioId, conversacionId, clienteId, zonaHoraria: zona, ahora };
    let uso: UsoDeTokens = { entrada: 0, entradaEnCache: 0, salida: 0, razonamiento: 0 };
    let texto = '';
    const funciones: string[] = [];

    for (let llamada = 0; llamada < MAX_LLAMADAS && !texto; llamada += 1) {
      const respuesta = await llamarModelo({ instrucciones, entrada, herramientas: HERRAMIENTAS, identificador: clienteId }, modelo);
      uso = sumar(uso, respuesta.uso);
      if (respuesta.llamadas.length === 0) {
        texto = respuesta.texto;
        if (!texto) throw new ErrorDelModelo('El modelo no respondió texto ni pidió funciones', true);
        break;
      }
      // Con store: false, lo que el modelo devolvió (razonamiento incluido) vuelve en la siguiente llamada.
      entrada.push(...respuesta.salida);
      for (const pedida of respuesta.llamadas) {
        funciones.push(pedida.nombre);
        const { salida } = await ejecutarHerramienta(pedida.nombre, pedida.argumentos, herramienta);
        entrada.push({ type: 'function_call_output', call_id: pedida.callId, output: salida });
      }
    }
    // Solo conteos y nombres de funciones: nunca el texto de la conversación.
    logger.info({ negocioId, funciones, uso }, 'IA atendió una conversación');
    if (!texto) throw new ErrorDelModelo(`Sin respuesta final tras ${MAX_LLAMADAS} llamadas`, true);

    const resultado = await enviarMensaje(
      { negocioId, conversacionId, texto: texto.slice(0, MAX_TEXTO), emisor: 'ia' },
      reloj(),
      envio,
    );
    if (resultado.estado === 'fallido' && resultado.reintentable) {
      throw new Error('WhatsApp no aceptó la respuesta; se reintenta');
    }
    if (resultado.estado === 'fallido') logger.warn({ negocioId }, 'WhatsApp rechazó la respuesta de la IA');
  };
}
