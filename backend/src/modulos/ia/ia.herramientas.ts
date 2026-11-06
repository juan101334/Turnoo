import { z } from 'zod';
import { ErrorDominio } from '../../compartido/errores.js';
import { esFechaLocal, fechaLocal, fechasEntre, horaLocal, instanteLocal } from '../../compartido/tiempo.js';
import * as citas from '../citas/citas.servicio.js';
import type { CitaDetalle } from '../citas/citas.tipos.js';
import { derivarConversacion } from '../conversaciones/conversaciones.servicio.js';
import { catalogoActivo } from '../profesionales/agenda.servicio.js';
import { diaDeLaSemana } from './ia.instrucciones.js';
import type { Herramienta } from './ia.proveedor.js';

/**
 * Las 7 funciones que puede usar la IA. Reglas:
 * - El negocio y el cliente los pone el backend (`ContextoHerramienta`), nunca el modelo: no hay
 *   ningún parámetro con el que pueda pedir datos de otro cliente o de otro negocio.
 * - Solo llaman a servicios, que ya aplican todas las reglas del panel (plazos, límites, huecos).
 * - Los argumentos los genera el modelo: se validan otra vez aquí, aunque el modo estricto ya
 *   los ajuste al esquema.
 * - Fechas y horas siempre locales ('AAAA-MM-DD' y 'HH:MM'): el modelo no convierte zonas.
 * - Un error del dominio (sin hueco, fuera de plazo...) vuelve al modelo como `{ok: false}` para
 *   que se lo explique al cliente. Cualquier otro error se lanza y el procesador reintenta.
 */

export interface ContextoHerramienta {
  negocioId: string;
  conversacionId: string;
  clienteId: string;
  zonaHoraria: string;
  ahora: Date;
}

/** Días que se pueden consultar de una vez: más días son más tokens en la respuesta. */
export const MAX_DIAS_DISPONIBILIDAD = 7;

const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const uuid = z.uuid();
const fecha = z.string().refine(esFechaLocal, 'debe ser una fecha AAAA-MM-DD');
const hora = z.string().regex(FORMATO_HORA, 'debe ser una hora HH:MM de 24 horas');
const servicioIds = z.array(uuid).min(1).max(5);

const objeto = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const textoJson = (description: string) => ({ type: 'string', description });
const listaIds = (description: string) => ({ type: 'array', items: { type: 'string' }, description });

export const HERRAMIENTAS: Herramienta[] = [
  {
    nombre: 'listar_profesionales_y_servicios',
    descripcion:
      'Lista los barberos de la barbería con sus servicios, duración en minutos y precio en pesos. ' +
      'Úsala antes de hablar de barberos, servicios o precios. Los ids de servicio son de cada barbero.',
    parametros: objeto({}),
  },
  {
    nombre: 'consultar_disponibilidad',
    descripcion:
      `Horas libres de un barbero para uno o varios de SUS servicios, entre dos fechas (máximo ${MAX_DIAS_DISPONIBILIDAD} días). ` +
      'Úsala siempre antes de ofrecer horas.',
    parametros: objeto({
      profesional_id: textoJson('id del barbero'),
      servicio_ids: listaIds('ids de los servicios de ese barbero'),
      fecha_desde: textoJson('fecha AAAA-MM-DD tomada del calendario'),
      fecha_hasta: textoJson('fecha AAAA-MM-DD tomada del calendario, igual o posterior a fecha_desde'),
    }),
  },
  {
    nombre: 'crear_cita',
    descripcion:
      'Agenda una cita para el cliente. Llámala solo después de que el cliente confirmó el día, la hora, ' +
      'el barbero y los servicios. La hora debe ser una de las que devolvió consultar_disponibilidad.',
    parametros: objeto({
      profesional_id: textoJson('id del barbero'),
      servicio_ids: listaIds('ids de los servicios de ese barbero'),
      fecha: textoJson('fecha AAAA-MM-DD'),
      hora: textoJson('hora HH:MM de 24 horas, tal como la devolvió consultar_disponibilidad'),
    }),
  },
  {
    nombre: 'listar_mis_citas',
    descripcion: 'Lista las citas activas y futuras del cliente con quien hablas.',
    parametros: objeto({}),
  },
  {
    nombre: 'cancelar_cita',
    descripcion: 'Cancela una cita del cliente. Llámala solo después de que el cliente confirmó cuál cita cancelar.',
    parametros: objeto({ cita_id: textoJson('id de la cita, de listar_mis_citas o de las citas activas') }),
  },
  {
    nombre: 'reprogramar_cita',
    descripcion:
      'Cambia la fecha y hora de una cita del cliente, con el mismo barbero y los mismos servicios. ' +
      'Antes consulta la disponibilidad y espera la confirmación del cliente.',
    parametros: objeto({
      cita_id: textoJson('id de la cita'),
      fecha: textoJson('nueva fecha AAAA-MM-DD'),
      hora: textoJson('nueva hora HH:MM de 24 horas, tal como la devolvió consultar_disponibilidad'),
    }),
  },
  {
    nombre: 'derivar_a_humano',
    descripcion:
      'Pasa la conversación a una persona de la barbería. Después de llamarla, despídete diciendo que una ' +
      'persona le va a escribir pronto.',
    parametros: objeto({
      motivo: {
        type: 'string',
        enum: ['sin_informacion', 'cliente_pidio_humano', 'fuera_de_tema', 'sin_comprension'],
        description: 'por qué se deriva. fuera_de_tema solo si el cliente insiste después de que ya le dijiste que solo ayudas con la barbería',
      },
      detalle: textoJson('qué pidió o preguntó el cliente, en una frase'),
    }),
  },
];

type Resultado = Record<string, unknown>;

function citaParaElModelo(c: CitaDetalle, zona: string) {
  const f = fechaLocal(c.inicio, zona);
  return {
    cita_id: c.id,
    fecha: f,
    dia_semana: diaDeLaSemana(f),
    hora: horaLocal(c.inicio, zona),
    barbero: c.profesionalNombre,
    servicios: c.servicios.map((s) => s.nombre),
    precio_total_cop: c.precioTotalCop,
    estado: c.estado,
  };
}

function leer<T>(esquema: z.ZodType<T>, argumentos: string): T {
  let datos: unknown;
  try {
    datos = JSON.parse(argumentos);
  } catch {
    throw new ArgumentosInvalidos('Los argumentos no son JSON válido');
  }
  const r = esquema.safeParse(datos);
  if (!r.success) {
    const p = r.error.issues[0];
    throw new ArgumentosInvalidos(`${p?.path.join('.') || 'argumentos'}: ${p?.message}`);
  }
  return r.data;
}

/** Argumentos mal formados: vuelve al modelo como error para que corrija, no se reintenta todo. */
class ArgumentosInvalidos extends Error {}

const EJECUTORES: Record<string, (argumentos: string, c: ContextoHerramienta) => Promise<Resultado>> = {
  async listar_profesionales_y_servicios(_argumentos, c) {
    const catalogo = await catalogoActivo(c.negocioId);
    return {
      barberos: catalogo.map((b) => ({
        profesional_id: b.id,
        nombre: b.nombre,
        servicios: b.servicios.map((s) => ({
          servicio_id: s.id,
          nombre: s.nombre,
          duracion_minutos: s.duracionMinutos,
          precio_cop: s.precioCop,
        })),
      })),
    };
  },

  async consultar_disponibilidad(argumentos, c) {
    const a = leer(
      z.strictObject({ profesional_id: uuid, servicio_ids: servicioIds, fecha_desde: fecha, fecha_hasta: fecha }),
      argumentos,
    );
    if (a.fecha_hasta >= a.fecha_desde && fechasEntre(a.fecha_desde, a.fecha_hasta).length > MAX_DIAS_DISPONIBILIDAD) {
      throw new ArgumentosInvalidos(`Consulta como máximo ${MAX_DIAS_DISPONIBILIDAD} días por vez`);
    }
    const d = await citas.consultarDisponibilidad(
      c.negocioId,
      { profesionalId: a.profesional_id, servicioIds: a.servicio_ids, desde: a.fecha_desde, hasta: a.fecha_hasta },
      c.ahora,
    );
    return {
      servicios: d.servicios.map((s) => s.nombre),
      duracion_total_minutos: d.duracionTotalMinutos,
      precio_total_cop: d.precioTotalCop,
      dias: d.dias.map((dia) => ({ fecha: dia.fecha, dia_semana: diaDeLaSemana(dia.fecha), horas: dia.huecos.map((h) => h.hora) })),
      ...(d.dias.length === 0 && { nota: 'No hay horas libres en esas fechas. Ofrece consultar otras fechas u otro barbero.' }),
    };
  },

  async crear_cita(argumentos, c) {
    const a = leer(
      z.strictObject({ profesional_id: uuid, servicio_ids: servicioIds, fecha, hora }),
      argumentos,
    );
    const inicio = instanteLocal(a.fecha, a.hora, c.zonaHoraria);
    // Un reintento del procesador puede repetir esta llamada: si la cita ya quedó, se devuelve esa.
    const activas = await citas.citasActivasDelCliente(c.negocioId, c.clienteId, c.ahora);
    const existente = activas.find(
      (x) => x.profesionalId === a.profesional_id && x.inicio.getTime() === inicio.getTime(),
    );
    if (existente) return { ok: true, ya_existia: true, cita: citaParaElModelo(existente, c.zonaHoraria) };

    const creada = await citas.crearCita(
      c.negocioId,
      { profesionalId: a.profesional_id, clienteId: c.clienteId, servicioIds: a.servicio_ids, inicio, origen: 'whatsapp' },
      c.ahora,
    );
    const detalle = (await citas.citasActivasDelCliente(c.negocioId, c.clienteId, c.ahora)).find((x) => x.id === creada.id);
    return {
      ok: true,
      cita: detalle ? citaParaElModelo(detalle, c.zonaHoraria) : { cita_id: creada.id },
      ...(creada.estado === 'por_aprobar' && {
        nota: 'La cita queda reservada pero el barbero debe aprobarla. Avísale al cliente que le confirmarán.',
      }),
    };
  },

  async listar_mis_citas(_argumentos, c) {
    const activas = await citas.citasActivasDelCliente(c.negocioId, c.clienteId, c.ahora);
    return { citas: activas.map((x) => citaParaElModelo(x, c.zonaHoraria)) };
  },

  async cancelar_cita(argumentos, c) {
    const a = leer(z.strictObject({ cita_id: uuid }), argumentos);
    await citas.cancelarCita(c.negocioId, a.cita_id, { tipo: 'cliente', clienteId: c.clienteId }, c.ahora);
    return { ok: true };
  },

  async reprogramar_cita(argumentos, c) {
    const a = leer(z.strictObject({ cita_id: uuid, fecha, hora }), argumentos);
    const inicio = instanteLocal(a.fecha, a.hora, c.zonaHoraria);
    await citas.reprogramarCita(c.negocioId, a.cita_id, inicio, { tipo: 'cliente', clienteId: c.clienteId }, c.ahora);
    return { ok: true, fecha: a.fecha, dia_semana: diaDeLaSemana(a.fecha), hora: a.hora };
  },

  async derivar_a_humano(argumentos, c) {
    const a = leer(
      z.strictObject({
        motivo: z.enum(['sin_informacion', 'cliente_pidio_humano', 'fuera_de_tema', 'sin_comprension']),
        detalle: z.string().max(2_000),
      }),
      argumentos,
    );
    await derivarConversacion(c.negocioId, c.conversacionId, a.motivo, a.detalle, c.ahora);
    return { ok: true, derivada: true };
  },
};

export const NOMBRES_HERRAMIENTAS = HERRAMIENTAS.map((h) => h.nombre);

/**
 * Ejecuta una función pedida por el modelo y devuelve el resultado en JSON para él.
 * `derivada` avisa que la conversación ya pasó a una persona.
 */
export async function ejecutarHerramienta(
  nombre: string,
  argumentos: string,
  contexto: ContextoHerramienta,
): Promise<{ salida: string; derivada: boolean }> {
  const ejecutor = EJECUTORES[nombre];
  if (!ejecutor) return { salida: JSON.stringify({ ok: false, error: `No existe la función ${nombre}` }), derivada: false };
  try {
    const resultado = await ejecutor(argumentos, contexto);
    return { salida: JSON.stringify(resultado), derivada: resultado.derivada === true };
  } catch (error) {
    if (error instanceof ArgumentosInvalidos || error instanceof ErrorDominio) {
      return { salida: JSON.stringify({ ok: false, error: error.message }), derivada: false };
    }
    throw error;
  }
}
