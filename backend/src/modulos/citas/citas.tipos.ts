export interface HorarioTrabajo {
  /** 1 = lunes ... 7 = domingo */
  diaSemana: number;
  /** Hora local del negocio, 'HH:MM:SS' */
  horaInicio: string;
  horaFin: string;
}

export interface Intervalo {
  inicio: Date;
  fin: Date;
}

export interface ReglasDeAgenda {
  zonaHoraria: string;
  estadoNegocio: string;
  intervaloMinutos: number;
  anticipacionMinMinutos: number;
  anticipacionMaxDias: number;
  /** null = sin límite. */
  maxCitasActivasCliente: number | null;
  horasLimiteCancelacion: number;
  maxInasistencias: number;
  ventanaInasistenciasDias: number;
  horasEsperaAprobacion: number;
  aprobacionMinutosAntesCita: number;
  /** Límite de citas al mes del plan; null = sin plan o sin límite. */
  maxCitasMes: number | null;
}

export type EstadoCita =
  | 'por_aprobar'
  | 'pendiente'
  | 'confirmada'
  | 'completada'
  | 'cancelada'
  | 'no_asistio';

/** Estados que ocupan el hueco del barbero. */
export const ESTADOS_ACTIVOS: readonly EstadoCita[] = ['por_aprobar', 'pendiente', 'confirmada'];

/** Quién pide el cambio. Un cliente solo puede tocar SUS citas; el backend (no la IA) pone el clienteId. */
export type Actor = { tipo: 'cliente'; clienteId: string } | { tipo: 'negocio' };

export interface Cita {
  id: string;
  profesionalId: string;
  clienteId: string;
  inicio: Date;
  fin: Date;
  estado: EstadoCita;
  precioTotalCop: number;
  aprobacionExpiraEn: Date | null;
}

export interface CitaCreada extends Cita {
  servicios: ServicioDeCita[];
}

export interface EntradaCita {
  profesionalId: string;
  clienteId: string;
  servicioIds: string[];
  inicio: Date;
  notas?: string;
  origen?: 'whatsapp' | 'panel';
  creadaPorUsuarioId?: string;
}

export interface ServicioDeCita {
  id: string;
  nombre: string;
  duracionMinutos: number;
  precioCop: number;
}

export interface ConsultaDisponibilidad {
  profesionalId: string;
  /** Uno o varios servicios del mismo barbero; la duración total es la suma. */
  servicioIds: string[];
  /** Fechas locales del negocio, 'AAAA-MM-DD', ambas incluidas. */
  desde: string;
  hasta: string;
}

export interface Hueco {
  /** Instante UTC en que empezaría la cita. */
  inicio: Date;
  fin: Date;
  /** Hora local del negocio, 'HH:mm'. */
  hora: string;
}

export interface DiaDisponible {
  fecha: string;
  huecos: Hueco[];
}

export interface Disponibilidad {
  profesionalId: string;
  servicios: ServicioDeCita[];
  duracionTotalMinutos: number;
  precioTotalCop: number;
  zonaHoraria: string;
  /** Solo los días que tienen al menos un hueco. */
  dias: DiaDisponible[];
}

/** Cita lista para mostrar en el panel: con cliente, barbero y servicios (copiados al agendar). */
export interface CitaDetalle extends Cita {
  clienteNombre: string | null;
  /** null si el cliente fue anonimizado. */
  clienteTelefono: string | null;
  profesionalNombre: string;
  notas: string | null;
  /** `servicioId` sirve para pedir la disponibilidad al reprogramar (mismos servicios, misma duración). */
  servicios: { servicioId: string; nombre: string; duracionMinutos: number; precioCop: number }[];
}

export interface FiltroCitas {
  /** Citas que EMPIEZAN desde este instante (incluido)... */
  desde: Date;
  /** ...hasta este (excluido). */
  hasta: Date;
  profesionalId?: string;
  estados?: EstadoCita[];
  /**
   * Si viene, cada cita trae el historial de su cliente (para decidir al aprobar). `profesionalId`
   * null = todo el negocio (dueño); con valor = solo las citas con ese barbero (empleado), igual
   * que el resumen de la lista de clientes.
   */
  historial?: { profesionalId: string | null };
}

/** Lo que el cliente ya hizo en el negocio, contado en la base (no se limita a las citas listadas). */
export interface HistorialDelCliente {
  clienteCitasCompletadas: number;
  clienteInasistencias: number;
}

/** Cita de la lista; con `historial` en el filtro trae además los contadores del cliente. */
export type CitaDeLista = CitaDetalle & Partial<HistorialDelCliente>;
