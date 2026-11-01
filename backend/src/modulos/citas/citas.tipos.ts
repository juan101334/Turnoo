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
  intervaloMinutos: number;
  anticipacionMinMinutos: number;
  anticipacionMaxDias: number;
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
