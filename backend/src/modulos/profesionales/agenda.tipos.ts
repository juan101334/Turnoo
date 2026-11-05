/** Servicios, horarios y bloqueos: lo que define cuándo y qué puede atender un barbero. */

export interface Servicio {
  id: string;
  profesionalId: string;
  nombre: string;
  duracionMinutos: number;
  precioCop: number;
  activo: boolean;
  createdAt: Date;
}

export interface EntradaServicio {
  nombre: string;
  duracionMinutos: number;
  precioCop: number;
}

export type CambiosServicio = { [K in keyof EntradaServicio]?: EntradaServicio[K] | undefined };

export interface Horario {
  id: string;
  profesionalId: string;
  /** 1 = lunes ... 7 = domingo. */
  diaSemana: number;
  /** Hora local del negocio, 'HH:MM'. */
  horaInicio: string;
  /** Hora local del negocio, 'HH:MM'; '24:00' es la medianoche al final del día. */
  horaFin: string;
}

export interface EntradaHorario {
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
}

export interface Bloqueo {
  id: string;
  /** null = bloqueo de todo el negocio (festivo o cierre). */
  profesionalId: string | null;
  inicio: Date;
  fin: Date;
  motivo: string | null;
}

export interface EntradaBloqueo {
  profesionalId: string | null;
  inicio: Date;
  fin: Date;
  motivo?: string | undefined;
}

/** Cita activa que un bloqueo o un cambio de horario deja fuera. El negocio decide qué hacer con ella. */
export interface CitaAfectada {
  id: string;
  profesionalId: string;
  inicio: Date;
  fin: Date;
  estado: string;
  clienteNombre: string | null;
  clienteTelefono: string;
}
