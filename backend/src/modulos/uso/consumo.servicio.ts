import { NoEncontrado } from '../../compartido/errores.js';
import { fechasEntre, primerDiaDelMes, sumarDias, sumarMinutos } from '../../compartido/tiempo.js';
import { esUuid } from '../../compartido/validacion.js';
import { entorno } from '../../config/entorno.js';
import { conSistema } from '../../db/contexto.js';
import * as repositorio from './consumo.repositorio.js';
import type { NegocioParaAlertas, UsoDeNegocio, UsoDelDia } from './consumo.repositorio.js';

/**
 * Panel de consumo del superadmin: cuánto usa la plataforma y cada negocio, y qué negocios piden
 * atención. Cruza negocios, por eso usa conSistema. Solo agregados: nada de aquí lleva mensajes,
 * teléfonos ni nombres de clientes.
 *
 * El mes se pide como 'AAAA-MM'. Las alertas y el ingreso contratado son siempre los de hoy: el
 * estado y el plan de un negocio no guardan historia.
 */

/** Zona con la que se decide cuál es "este mes" cuando no se pide uno: la del superadmin. */
const ZONA_DEL_PANEL = 'America/Bogota';
const MINUTOS_POR_DIA = 24 * 60;
const MS_POR_DIA = MINUTOS_POR_DIA * 60_000;
/** Igual que el aviso al dueño: desde el 80% del límite de conversaciones de IA. */
const PORCENTAJE_DE_ALERTA = 80;
const DIAS_PARA_VENCER_LA_PRUEBA = 5;
const DIAS_SIN_CITAS = 14;

// ---------------------------------------------------------------------
// Costo estimado
// ---------------------------------------------------------------------

/** Tarifas en pesos colombianos. Los valores vienen del entorno: nunca se escriben en el código. */
export interface Tarifas {
  iaEntradaCopMillon: number;
  iaSalidaCopMillon: number;
  audioCopMinuto: number;
  plantillaUtilidadCop: number;
}

/** null si falta alguna: con una tarifa de menos el costo sería engañoso, así que no se calcula. */
export function tarifasDelEntorno(): Tarifas | null {
  const {
    TARIFA_IA_ENTRADA_COP_MILLON: iaEntradaCopMillon,
    TARIFA_IA_SALIDA_COP_MILLON: iaSalidaCopMillon,
    TARIFA_AUDIO_COP_MINUTO: audioCopMinuto,
    TARIFA_PLANTILLA_UTILIDAD_COP: plantillaUtilidadCop,
  } = entorno;
  if (
    iaEntradaCopMillon === undefined ||
    iaSalidaCopMillon === undefined ||
    audioCopMinuto === undefined ||
    plantillaUtilidadCop === undefined
  ) {
    return null;
  }
  return { iaEntradaCopMillon, iaSalidaCopMillon, audioCopMinuto, plantillaUtilidadCop };
}

/** Costo estimado en pesos, redondeado al peso. */
export interface Costo {
  iaCop: number;
  audioCop: number;
  plantillasCop: number;
  totalCop: number;
}

type Unidades = Pick<UsoDeNegocio, 'tokensEntrada' | 'tokensSalida' | 'segundosAudio' | 'plantillas'>;

function costoDe(u: Unidades, t: Tarifas | null): Costo | null {
  if (!t) return null;
  const iaCop = Math.round((u.tokensEntrada * t.iaEntradaCopMillon + u.tokensSalida * t.iaSalidaCopMillon) / 1_000_000);
  const audioCop = Math.round((u.segundosAudio / 60) * t.audioCopMinuto);
  const plantillasCop = Math.round(u.plantillas * t.plantillaUtilidadCop);
  return { iaCop, audioCop, plantillasCop, totalCop: iaCop + audioCop + plantillasCop };
}

// ---------------------------------------------------------------------
// Por negocio
// ---------------------------------------------------------------------

export interface ConsumoDeNegocio extends Omit<UsoDeNegocio, 'citas' | 'ultimaActividad'> {
  /** Conversaciones de IA frente al límite del plan; null sin plan o sin límite. */
  porcentajeIa: number | null;
  /** Citas del mes (por su fecha de inicio), en cualquier estado. */
  citas: number;
  citasPorEstado: UsoDeNegocio['citas'];
  /** De las citas que ya pasaron (completadas + no asistió), cuántas fueron inasistencia. */
  porcentajeNoAsistio: number | null;
  /** De todas las citas del mes, cuántas se cancelaron. */
  porcentajeCancelacion: number | null;
  /** Recordatorios, avisos al dueño y mensajes que WhatsApp no entregó. */
  fallosDeEnvio: number;
  /** Días desde el último mensaje de un cliente o la última cita creada; null si nunca hubo. */
  diasSinActividad: number | null;
  costo: Costo | null;
  /** Precio del plan menos el costo estimado; null sin plan o sin tarifas. */
  margenCop: number | null;
}

/** Porcentaje con un decimal; null si no hay sobre qué calcularlo. */
function porcentaje(parte: number, total: number | null): number | null {
  return total === null || total <= 0 ? null : Math.round((parte / total) * 1000) / 10;
}

function consumoDe(u: UsoDeNegocio, ahora: Date, tarifas: Tarifas | null): ConsumoDeNegocio {
  const { citas: e, ultimaActividad, ...resto } = u;
  const total = e.porAprobar + e.pendientes + e.confirmadas + e.completadas + e.canceladas + e.noAsistio;
  const costo = costoDe(u, tarifas);
  return {
    ...resto,
    porcentajeIa: porcentaje(u.conversacionesIa, u.plan?.maxConversacionesIa ?? null),
    citas: total,
    citasPorEstado: e,
    porcentajeNoAsistio: porcentaje(e.noAsistio, e.completadas + e.noAsistio),
    porcentajeCancelacion: porcentaje(e.canceladas, total),
    fallosDeEnvio: u.fallos.recordatorios + u.fallos.avisos + u.fallos.mensajes,
    diasSinActividad:
      ultimaActividad === null ? null : Math.max(0, Math.floor((ahora.getTime() - ultimaActividad.getTime()) / MS_POR_DIA)),
    costo,
    margenCop: u.plan && costo ? u.plan.precioMensualCop - costo.totalCop : null,
  };
}

/** 'AAAA-MM' pedido, o el mes en curso. Devuelve también su `periodo` ('AAAA-MM-01'). */
function mesPedido(mes: string | undefined, ahora: Date): { mes: string; periodo: string } {
  const periodo = mes ? `${mes}-01` : primerDiaDelMes(ahora, ZONA_DEL_PANEL);
  return { mes: periodo.slice(0, 7), periodo };
}

/** Todos los días del mes, también los que no tuvieron uso (en cero). */
function diasDelMes(mes: string, periodo: string, conUso: UsoDelDia[]): UsoDelDia[] {
  const porFecha = new Map(conUso.map((d) => [d.fecha, d]));
  return fechasEntre(periodo, sumarDias(periodo, 30))
    .filter((fecha) => fecha.startsWith(mes))
    .map((fecha) => porFecha.get(fecha) ?? { fecha, atencionesIa: 0, plantillas: 0, segundosAudio: 0, citasCreadas: 0 });
}

export interface ConsumoPorNegocio {
  mes: string;
  negocios: ConsumoDeNegocio[];
}

export async function consumoPorNegocio(
  mes?: string,
  ahora: Date = new Date(),
  tarifas: Tarifas | null = tarifasDelEntorno(),
): Promise<ConsumoPorNegocio> {
  const pedido = mesPedido(mes, ahora);
  const uso = await conSistema((tx) => repositorio.usoPorNegocio(tx, pedido.periodo));
  return { mes: pedido.mes, negocios: uso.map((u) => consumoDe(u, ahora, tarifas)) };
}

export interface DetalleDeConsumo extends ConsumoDeNegocio {
  mes: string;
  derivacionesPorMotivo: { motivo: string; cantidad: number }[];
  diario: UsoDelDia[];
  /** Primer día con detalle por día; antes, el gráfico diario no tiene IA, audio ni plantillas. */
  detallePorDiaDesde: string | null;
}

export async function consumoDeNegocio(
  negocioId: string,
  mes?: string,
  ahora: Date = new Date(),
  tarifas: Tarifas | null = tarifasDelEntorno(),
): Promise<DetalleDeConsumo> {
  if (!esUuid(negocioId)) throw new NoEncontrado('El negocio');
  const pedido = mesPedido(mes, ahora);
  return conSistema(async (tx) => {
    const [uso] = await repositorio.usoPorNegocio(tx, pedido.periodo, negocioId);
    if (!uso) throw new NoEncontrado('El negocio');
    return {
      mes: pedido.mes,
      ...consumoDe(uso, ahora, tarifas),
      derivacionesPorMotivo: await repositorio.derivacionesPorMotivo(tx, pedido.periodo, negocioId),
      diario: diasDelMes(pedido.mes, pedido.periodo, await repositorio.usoPorDia(tx, pedido.periodo, negocioId)),
      detallePorDiaDesde: await repositorio.primerDiaConDetalle(tx),
    };
  });
}

// ---------------------------------------------------------------------
// Resumen de la plataforma y alertas
// ---------------------------------------------------------------------

interface NegocioEnAlerta {
  negocioId: string;
  nombre: string;
}

export interface Alertas {
  /** Al 80% o más de las conversaciones de IA de su plan este mes: candidatos a subir de plan. */
  cercaDelLimite: (NegocioEnAlerta & { plan: string | null; conversacionesIa: number; limite: number; porcentaje: number })[];
  /** En prueba y con la prueba vencida o por vencer en 5 días. */
  pruebasPorVencer: (NegocioEnAlerta & { pruebaHasta: Date })[];
  /** Creados hace 14 días o más y sin una cita nueva en los últimos 14. */
  sinCitas: (NegocioEnAlerta & { ultimaCitaCreada: Date | null })[];
}

function alertasDe(negocios: NegocioParaAlertas[], ahora: Date): Alertas {
  const alertas: Alertas = { cercaDelLimite: [], pruebasPorVencer: [], sinCitas: [] };
  const finDelAviso = sumarMinutos(ahora, DIAS_PARA_VENCER_LA_PRUEBA * MINUTOS_POR_DIA);
  const haceDosSemanas = sumarMinutos(ahora, -DIAS_SIN_CITAS * MINUTOS_POR_DIA);
  for (const n of negocios) {
    const quien = { negocioId: n.negocioId, nombre: n.nombre };
    const limite = n.limiteConversacionesIa;
    if (limite !== null && n.conversacionesIa * 100 >= limite * PORCENTAJE_DE_ALERTA) {
      alertas.cercaDelLimite.push({
        ...quien,
        plan: n.plan,
        conversacionesIa: n.conversacionesIa,
        limite,
        porcentaje: porcentaje(n.conversacionesIa, limite) ?? 0,
      });
    }
    if (n.estado === 'prueba' && n.pruebaHasta !== null && n.pruebaHasta <= finDelAviso) {
      alertas.pruebasPorVencer.push({ ...quien, pruebaHasta: n.pruebaHasta });
    }
    // Un negocio recién creado todavía no tuvo 14 días para agendar: no es una alerta.
    if (n.creadoEn <= haceDosSemanas && (n.ultimaCitaCreada === null || n.ultimaCitaCreada < haceDosSemanas)) {
      alertas.sinCitas.push({ ...quien, ultimaCitaCreada: n.ultimaCitaCreada });
    }
  }
  return alertas;
}

export interface ResumenDeConsumo {
  mes: string;
  /** Estado de hoy. */
  negocios: { activos: number; enPrueba: number; suspendidos: number };
  /**
   * Ingreso mensual contratado: la suma del precio del plan de los negocios activos (los que
   * pagan). No cuenta los que están en prueba ni los suspendidos. Es lo contratado hoy, no lo cobrado.
   */
  mrrContratadoCop: number;
  uso: { conversacionesIa: number; plantillas: number; segundosAudio: number; tokensEntrada: number; tokensSalida: number; citas: number };
  costo: Costo | null;
  diario: UsoDelDia[];
  detallePorDiaDesde: string | null;
  alertas: Alertas;
}

export async function resumenDeConsumo(
  mes?: string,
  ahora: Date = new Date(),
  tarifas: Tarifas | null = tarifasDelEntorno(),
): Promise<ResumenDeConsumo> {
  const pedido = mesPedido(mes, ahora);
  const datos = await conSistema(async (tx) => ({
    uso: await repositorio.usoPorNegocio(tx, pedido.periodo),
    diario: await repositorio.usoPorDia(tx, pedido.periodo),
    detallePorDiaDesde: await repositorio.primerDiaConDetalle(tx),
    paraAlertas: await repositorio.negociosParaAlertas(tx, ahora),
  }));
  const negocios = datos.uso.map((u) => consumoDe(u, ahora, tarifas));
  const suma = (valor: (n: ConsumoDeNegocio) => number) => negocios.reduce((total, n) => total + valor(n), 0);
  const cuantos = (estado: UsoDeNegocio['estado']) => negocios.filter((n) => n.estado === estado).length;

  return {
    mes: pedido.mes,
    negocios: { activos: cuantos('activo'), enPrueba: cuantos('prueba'), suspendidos: cuantos('suspendido') },
    mrrContratadoCop: suma((n) => (n.estado === 'activo' ? (n.plan?.precioMensualCop ?? 0) : 0)),
    uso: {
      conversacionesIa: suma((n) => n.conversacionesIa),
      plantillas: suma((n) => n.plantillas),
      segundosAudio: suma((n) => n.segundosAudio),
      tokensEntrada: suma((n) => n.tokensEntrada),
      tokensSalida: suma((n) => n.tokensSalida),
      citas: suma((n) => n.citas),
    },
    // La suma de los costos por negocio, para que el total coincida con la tabla.
    costo: tarifas
      ? {
          iaCop: suma((n) => n.costo?.iaCop ?? 0),
          audioCop: suma((n) => n.costo?.audioCop ?? 0),
          plantillasCop: suma((n) => n.costo?.plantillasCop ?? 0),
          totalCop: suma((n) => n.costo?.totalCop ?? 0),
        }
      : null,
    diario: diasDelMes(pedido.mes, pedido.periodo, datos.diario),
    detallePorDiaDesde: datos.detallePorDiaDesde,
    alertas: alertasDe(datos.paraAlertas, ahora),
  };
}
