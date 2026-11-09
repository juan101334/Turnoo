export type EstadoNegocio = 'prueba' | 'activo' | 'suspendido';

export interface Negocio {
  id: string;
  nombre: string;
  telefonoAvisos: string | null;
  zonaHoraria: string;
  estado: EstadoNegocio;
  planId: string | null;
  pruebaHasta: Date | null;
  pagadoHasta: Date | null;
  createdAt: Date;
}

/** En la lista del superadmin: además, si el negocio tiene al menos un número de WhatsApp activo. */
export interface NegocioDeLaLista extends Negocio {
  whatsappConectado: boolean;
}

export interface ConfiguracionNegocio {
  intervaloMinutos: number;
  anticipacionMinMinutos: number;
  anticipacionMaxDias: number;
  /** null = sin límite de citas activas por cliente. */
  maxCitasActivasCliente: number | null;
  horasLimiteCancelacion: number;
  horasRecordatorio: number;
  /** Hora local del negocio, 'HH:MM'. */
  recordatorioNoAntesDe: string;
  /** Hora local del negocio, 'HH:MM'. */
  recordatorioNoDespuesDe: string;
  maxInasistencias: number;
  ventanaInasistenciasDias: number;
  horasEsperaAprobacion: number;
  aprobacionMinutosAntesCita: number;
  horasModoHumano: number;
  horasAutocompletarCita: number;
}

/** Un cambio parcial: lo que no viene (undefined) no se toca. */
type Cambios<T> = { [K in keyof T]?: T[K] | undefined };

export interface EntradaNegocio {
  nombre: string;
  zonaHoraria?: string | undefined;
  telefonoAvisos?: string | null | undefined;
  planId?: string | null | undefined;
}

/** Lo único que el dueño puede cambiar de su negocio. Plan y estado son del superadmin. */
export type CambiosMiNegocio = Cambios<Pick<Negocio, 'nombre' | 'telefonoAvisos' | 'zonaHoraria'>>;

/** Lo único que el superadmin cambia de un negocio. */
export type CambiosAdministrativos = Cambios<Pick<Negocio, 'planId' | 'estado'>>;

export type CambiosConfiguracion = Cambios<ConfiguracionNegocio>;
