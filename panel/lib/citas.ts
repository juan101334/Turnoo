/**
 * Citas tal como las devuelve el backend (GET /citas, GET /citas/:id) y qué se puede hacer con
 * cada una. Las reglas de aquí solo deciden qué botones mostrar; quien decide de verdad es el
 * backend, que responde con un error claro si la acción ya no vale.
 */

export type EstadoCita = 'por_aprobar' | 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no_asistio';

export interface ServicioDeCita {
  servicioId: string;
  nombre: string;
  duracionMinutos: number;
  precioCop: number;
}

export interface Cita {
  id: string;
  profesionalId: string;
  clienteId: string;
  inicio: string;
  fin: string;
  estado: EstadoCita;
  precioTotalCop: number;
  aprobacionExpiraEn: string | null;
  clienteNombre: string | null;
  /** null si el cliente fue anonimizado. */
  clienteTelefono: string | null;
  profesionalNombre: string;
  notas: string | null;
  servicios: ServicioDeCita[];
}

/** `clases`: la insignia; `franja`: el borde izquierdo de la tarjeta o el bloque (color del estado). */
/** `texto`: color del ícono y del nombre del estado cuando van sin fondo (en la grilla del PC). */
export const ESTADOS: Record<EstadoCita, { etiqueta: string; clases: string; franja: string; texto: string }> = {
  por_aprobar: { etiqueta: 'Por aprobar', clases: 'bg-aviso-suave text-aviso', franja: 'border-l-estado-por-aprobar', texto: 'text-aviso' },
  pendiente: { etiqueta: 'Pendiente', clases: 'bg-fondo text-suave ring-1 ring-borde', franja: 'border-l-estado-pendiente', texto: 'text-suave' },
  confirmada: { etiqueta: 'Confirmada', clases: 'bg-marca-suave text-marca-oscura', franja: 'border-l-estado-confirmada', texto: 'text-marca' },
  completada: { etiqueta: 'Completada', clases: 'bg-exito-suave text-exito', franja: 'border-l-estado-completada', texto: 'text-exito' },
  no_asistio: { etiqueta: 'No asistió', clases: 'bg-peligro-suave text-peligro', franja: 'border-l-estado-no-asistio', texto: 'text-peligro' },
  cancelada: { etiqueta: 'Cancelada', clases: 'bg-fondo text-suave line-through', franja: 'border-l-estado-cancelada', texto: 'text-suave' },
};

export type Accion = 'completar' | 'noAsistio' | 'reprogramar' | 'cancelar' | 'aprobar' | 'rechazar';

/**
 * Lo que tiene sentido ofrecer, con las mismas reglas del backend:
 * - completada / no asistió: desde la hora en que empieza; se puede corregir entre las dos;
 * - reprogramar: pendiente o confirmada; cancelar: cualquier cita activa;
 * - aprobar o rechazar: por aprobar, mientras no venza el plazo (rechazar es su forma de cancelarla).
 */
export function accionesPosibles(cita: Pick<Cita, 'estado' | 'inicio' | 'aprobacionExpiraEn'>, ahora: Date = new Date()): Accion[] {
  const empezo = Date.parse(cita.inicio) <= ahora.getTime();
  switch (cita.estado) {
    case 'pendiente':
    case 'confirmada':
      return [...(empezo ? (['completar', 'noAsistio'] as const) : []), 'reprogramar', 'cancelar'];
    case 'por_aprobar': {
      const vencida = cita.aprobacionExpiraEn !== null && Date.parse(cita.aprobacionExpiraEn) <= ahora.getTime();
      return vencida ? [] : ['aprobar', 'rechazar'];
    }
    case 'completada':
      return ['noAsistio'];
    case 'no_asistio':
      return ['completar'];
    case 'cancelada':
      return [];
  }
}

/** '$25.000'. */
export function pesos(cop: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(cop).replace(/\s/g, '');
}

/** 'Corte y Barba' o 'Corte, Barba y Cejas'. */
export function nombresDeServicios(servicios: Pick<ServicioDeCita, 'nombre'>[]): string {
  const nombres = servicios.map((s) => s.nombre);
  if (nombres.length <= 1) return nombres[0] ?? 'Sin servicio';
  return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
}

/** '+57 300 123 4567' para mostrar; el enlace usa el número completo. */
export function telefonoLegible(telefono: string): string {
  const m = /^57(\d{3})(\d{3})(\d{4})$/.exec(telefono);
  return m ? `+57 ${m[1]} ${m[2]} ${m[3]}` : `+${telefono}`;
}
