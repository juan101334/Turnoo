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
