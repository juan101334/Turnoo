import { DateTime } from 'luxon';
import type { MotivoDerivacion } from './conversaciones';
import type { EstadoNegocio } from './plan';

/**
 * Uso de la plataforma para el superadmin (GET /consumo, /consumo/negocios y /consumo/negocios/:id).
 * Todo son agregados: el backend no devuelve aquí mensajes, teléfonos ni nombres de clientes.
 * Aquí van los tipos y las cuentas que no necesitan el servidor (mes, orden, formato).
 */

/** Costo estimado en pesos. null en todo lo que lo lleva si el servidor no tiene las tarifas. */
export interface Costo {
  iaCop: number;
  audioCop: number;
  plantillasCop: number;
  totalCop: number;
}

export interface UsoDelDia {
  /** Día local del negocio, AAAA-MM-DD. */
  fecha: string;
  atencionesIa: number;
  plantillas: number;
  segundosAudio: number;
  citasCreadas: number;
}

export interface ConsumoDeNegocio {
  negocioId: string;
  nombre: string;
  estado: EstadoNegocio;
  pruebaHasta: string | null;
  plan: { nombre: string; precioMensualCop: number; maxConversacionesIa: number | null } | null;
  conversacionesIa: number;
  /** Frente al límite del plan; null sin plan o sin límite. */
  porcentajeIa: number | null;
  plantillas: number;
  segundosAudio: number;
  tokensEntrada: number;
  tokensSalida: number;
  /** Citas del mes por su fecha de inicio, en cualquier estado. */
  citas: number;
  citasPorEstado: { porAprobar: number; pendientes: number; confirmadas: number; completadas: number; canceladas: number; noAsistio: number };
  canceladasPor: { cliente: number; negocio: number; sistema: number };
  porcentajeNoAsistio: number | null;
  porcentajeCancelacion: number | null;
  derivaciones: number;
  fallos: { recordatorios: number; avisos: number; mensajes: number };
  fallosDeEnvio: number;
  /** null: nunca hubo un mensaje de un cliente ni una cita. */
  diasSinActividad: number | null;
  costo: Costo | null;
  /** Precio del plan menos el costo; null sin plan o sin tarifas. */
  margenCop: number | null;
}

export interface DetalleDeConsumo extends ConsumoDeNegocio {
  mes: string;
  derivacionesPorMotivo: { motivo: MotivoDerivacion; cantidad: number }[];
  diario: UsoDelDia[];
  detallePorDiaDesde: string | null;
}

interface NegocioEnAlerta {
  negocioId: string;
  nombre: string;
}

export interface Alertas {
  cercaDelLimite: (NegocioEnAlerta & { plan: string | null; conversacionesIa: number; limite: number; porcentaje: number })[];
  pruebasPorVencer: (NegocioEnAlerta & { pruebaHasta: string })[];
  sinCitas: (NegocioEnAlerta & { ultimaCitaCreada: string | null })[];
}

export interface ResumenDeConsumo {
  mes: string;
  negocios: { activos: number; enPrueba: number; suspendidos: number };
  /** Suma del plan de los negocios activos: lo contratado hoy, no lo cobrado. */
  mrrContratadoCop: number;
  uso: { conversacionesIa: number; plantillas: number; segundosAudio: number; tokensEntrada: number; tokensSalida: number; citas: number };
  costo: Costo | null;
  diario: UsoDelDia[];
  /** Primer día con detalle por día de IA, audio y plantillas; null si aún no hay ninguno. */
  detallePorDiaDesde: string | null;
  alertas: Alertas;
}

// ---------------------------------------------------------------------
// Mes
// ---------------------------------------------------------------------

/** La zona del superadmin: decide cuál es "este mes". */
export const ZONA_DEL_PANEL = 'America/Bogota';

const MES = /^20\d{2}-(0[1-9]|1[0-2])$/;

export function mesActual(ahora: Date = new Date()): string {
  return DateTime.fromJSDate(ahora).setZone(ZONA_DEL_PANEL).toFormat('yyyy-MM');
}

/** El mes de la URL si está bien escrito y no es futuro; si no, el actual. */
export function mesElegido(texto: string | undefined, ahora: Date = new Date()): string {
  const actual = mesActual(ahora);
  return texto && MES.test(texto) && texto <= actual ? texto : actual;
}

/** El mes anterior (-1) o el siguiente (+1). */
export function mesVecino(mes: string, pasos: 1 | -1): string {
  return DateTime.fromISO(mes).plus({ months: pasos }).toFormat('yyyy-MM');
}

// ---------------------------------------------------------------------
// Orden de la tabla por negocio
// ---------------------------------------------------------------------

/** De cada columna, el valor por el que se ordena. null va siempre al final. */
export const COLUMNAS = {
  nombre: (n: ConsumoDeNegocio) => n.nombre.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase(),
  ia: (n: ConsumoDeNegocio) => n.porcentajeIa,
  citas: (n: ConsumoDeNegocio) => n.citas,
  inasistencia: (n: ConsumoDeNegocio) => n.porcentajeNoAsistio,
  mensajes: (n: ConsumoDeNegocio) => n.plantillas,
  fallos: (n: ConsumoDeNegocio) => n.fallosDeEnvio,
  inactividad: (n: ConsumoDeNegocio) => n.diasSinActividad,
  costo: (n: ConsumoDeNegocio) => n.costo?.totalCop ?? null,
  margen: (n: ConsumoDeNegocio) => n.margenCop,
} as const;

export type Columna = keyof typeof COLUMNAS;
export interface Orden {
  columna: Columna;
  direccion: 'asc' | 'desc';
}

export const ORDEN_INICIAL: Orden = { columna: 'nombre', direccion: 'asc' };

/** Lo que diga la URL, si es una columna que existe. */
export function leerOrden(p: { orden?: string | undefined; dir?: string | undefined }): Orden {
  if (!p.orden || !Object.hasOwn(COLUMNAS, p.orden)) return ORDEN_INICIAL;
  const columna = p.orden as Columna;
  return { columna, direccion: p.dir === 'asc' || p.dir === 'desc' ? p.dir : direccionInicial(columna) };
}

/** El nombre empieza de la A a la Z; los números, por el mayor (lo que más pide atención). */
function direccionInicial(columna: Columna): Orden['direccion'] {
  return columna === 'nombre' || columna === 'margen' ? 'asc' : 'desc';
}

/** Tocar la columna ya ordenada le da la vuelta; tocar otra empieza por su dirección inicial. */
export function siguienteOrden(actual: Orden, columna: Columna): Orden {
  if (actual.columna !== columna) return { columna, direccion: direccionInicial(columna) };
  return { columna, direccion: actual.direccion === 'asc' ? 'desc' : 'asc' };
}

export function ordenar(negocios: ConsumoDeNegocio[], { columna, direccion }: Orden): ConsumoDeNegocio[] {
  const valor = COLUMNAS[columna];
  const signo = direccion === 'asc' ? 1 : -1;
  return [...negocios].sort((a, b) => {
    const [va, vb] = [valor(a), valor(b)];
    if (va === null || vb === null) return va === vb ? a.nombre.localeCompare(b.nombre, 'es') : va === null ? 1 : -1;
    const diferencia = typeof va === 'string' ? va.localeCompare(String(vb), 'es') : va - Number(vb);
    return diferencia !== 0 ? diferencia * signo : a.nombre.localeCompare(b.nombre, 'es');
  });
}

// ---------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------

const numero = new Intl.NumberFormat('es-CO');
const decimal = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

export function cantidad(n: number): string {
  return numero.format(n);
}

/** '12,5%'. */
export function porcentaje(n: number): string {
  return `${decimal.format(n)}%`;
}

/** Tokens en corto: 950, '12,3 mil', '1,5 M'. */
export function tokens(n: number): string {
  if (n < 1000) return numero.format(n);
  return n < 1_000_000 ? `${decimal.format(n / 1000)} mil` : `${decimal.format(n / 1_000_000)} M`;
}

/** Segundos de audio como minutos: '0 min', '1,5 min', '12 min'. */
export function minutosDeAudio(segundos: number): string {
  return `${decimal.format(segundos / 60)} min`;
}

/** 'Hoy', 'Hace 1 día', 'Hace 12 días'; sin actividad nunca, 'Nunca'. */
export function haceDias(dias: number | null): string {
  if (dias === null) return 'Nunca';
  return dias === 0 ? 'Hoy' : `Hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

// ---------------------------------------------------------------------
// Gráfico diario
// ---------------------------------------------------------------------

export const SERIES = {
  ia: { etiqueta: 'Respuestas del asistente', valor: (d: UsoDelDia) => d.atencionesIa, conDetalle: true },
  mensajes: { etiqueta: 'Mensajes automáticos', valor: (d: UsoDelDia) => d.plantillas, conDetalle: true },
  citas: { etiqueta: 'Citas creadas', valor: (d: UsoDelDia) => d.citasCreadas, conDetalle: false },
} as const;

export type Serie = keyof typeof SERIES;

export function leerSerie(texto: string | undefined): Serie {
  return texto && Object.hasOwn(SERIES, texto) ? (texto as Serie) : 'ia';
}

/**
 * La IA, el audio y los mensajes automáticos se registran por día desde `desde`. Si el mes
 * empieza antes (o todavía no hay registro), parte del gráfico está en cero por falta de datos,
 * no porque no hubiera uso: hay que decirlo.
 */
export function faltaDetalle(mes: string, desde: string | null): boolean {
  return desde === null || desde > `${mes}-01`;
}
