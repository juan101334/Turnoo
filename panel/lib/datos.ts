import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { ErrorDelBackend, llamarAlBackend } from './backend';
import type { Bloqueo } from './bloqueos';
import type { Cita, EstadoCita } from './citas';
import { limitesDelDia } from './fechas';

/**
 * Lecturas para las páginas. Si la sesión ya no vale, al login; si el backend dice que algo no
 * existe (o es de otro barbero, que el backend responde igual), la página de "no existe".
 * Cualquier otro error lo muestra app/(panel)/error.tsx.
 */
export async function leer<T>(ruta: string): Promise<T> {
  try {
    return await llamarAlBackend<T>(ruta);
  } catch (error) {
    if (error instanceof ErrorDelBackend) {
      if (error.estado === 401) redirect('/sesion-vencida');
      if (error.estado === 404) notFound();
    }
    throw error;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Los ids van dentro de rutas del backend: solo se aceptan UUID, nunca texto libre como "../". */
export const esId = (texto: unknown): texto is string => typeof texto === 'string' && UUID.test(texto);

export interface FiltroDeCitas {
  /** Solo las de ese barbero (al barbero, el backend ya le da solo las suyas). */
  profesionalId?: string | undefined;
  estados?: EstadoCita[];
}

export async function citasDelDia(fecha: string, zona: string, filtro: FiltroDeCitas = {}): Promise<Cita[]> {
  const { desde, hasta } = limitesDelDia(fecha, zona);
  return citasEntre(desde, hasta, filtro);
}

/** Citas que empiezan entre `desde` (incluido) y `hasta` (excluido). El backend admite hasta 62 días. */
export async function citasEntre(desde: string, hasta: string, { profesionalId, estados }: FiltroDeCitas = {}): Promise<Cita[]> {
  const consulta = new URLSearchParams({ desde, hasta });
  if (profesionalId && esId(profesionalId)) consulta.set('profesionalId', profesionalId);
  if (estados?.length) consulta.set('estado', estados.join(','));
  return (await leer<{ citas: Cita[] }>(`/citas?${consulta}`)).citas;
}

/** Hasta dónde se buscan citas por aprobar: el backend lista como mucho 62 días por consulta. */
export const DIAS_POR_APROBAR = 60;

/** Citas por aprobar que aún no empiezan, la que vence primero arriba. */
export async function citasPorAprobar(ahora: Date = new Date()): Promise<Cita[]> {
  const hasta = new Date(ahora.getTime() + DIAS_POR_APROBAR * 86_400_000);
  const citas = await citasEntre(ahora.toISOString(), hasta.toISOString(), { estados: ['por_aprobar'] });
  const vence = (c: Cita) => (c.aprobacionExpiraEn ? Date.parse(c.aprobacionExpiraEn) : Date.parse(c.inicio));
  return citas.sort((a, b) => vence(a) - vence(b));
}

/** Bloqueos que se cruzan con el rango (el backend admite hasta 62 días). Al barbero, los suyos y los del negocio. */
export async function bloqueosEntre(desde: string, hasta: string): Promise<Bloqueo[]> {
  return (await leer<{ bloqueos: Bloqueo[] }>(`/bloqueos?${new URLSearchParams({ desde, hasta })}`)).bloqueos;
}

export interface Cliente {
  id: string;
  nombre: string | null;
  /** null si fue anonimizado. */
  telefono: string | null;
  notas: string | null;
  anonimizadoEn: string | null;
  createdAt: string;
}

export const CLIENTES_POR_PAGINA = 30;

/** Al dueño, todo el negocio; al barbero, solo los clientes con citas suyas (lo decide el backend). */
export async function clientes(buscar: string, pagina: number): Promise<{ clientes: Cliente[]; hayMas: boolean }> {
  const consulta = new URLSearchParams({ limite: String(CLIENTES_POR_PAGINA), desplazamiento: String(pagina * CLIENTES_POR_PAGINA) });
  if (buscar) consulta.set('buscar', buscar);
  return leer(`/clientes?${consulta}`);
}

export async function cliente(id: string): Promise<Cliente> {
  if (!esId(id)) notFound();
  return leer<Cliente>(`/clientes/${id}`);
}

export async function cita(id: string): Promise<Cita> {
  if (!esId(id)) notFound();
  return leer<Cita>(`/citas/${id}`);
}

export interface Barbero {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface ServicioDelBarbero {
  id: string;
  nombre: string;
  duracionMinutos: number;
  precioCop: number;
  activo: boolean;
}

/** Al dueño, todos los barberos; al barbero, solo el suyo (lo decide el backend). */
export async function barberos(): Promise<Barbero[]> {
  return (await leer<{ profesionales: Barbero[] }>('/profesionales')).profesionales;
}

export async function serviciosDe(profesionalId: string): Promise<ServicioDelBarbero[]> {
  if (!esId(profesionalId)) notFound();
  return (await leer<{ servicios: ServicioDelBarbero[] }>(`/profesionales/${profesionalId}/servicios`)).servicios;
}

export interface Hueco {
  inicio: string;
  hora: string;
}

/** Horarios libres de un barbero un día, para unos servicios (su duración total). */
export async function huecosDelDia(profesionalId: string, servicioIds: string[], fecha: string): Promise<Hueco[]> {
  if (!esId(profesionalId) || servicioIds.length === 0 || !servicioIds.every(esId)) return [];
  const consulta = new URLSearchParams({ profesionalId, servicioIds: servicioIds.join(','), desde: fecha, hasta: fecha });
  const { dias } = await leer<{ dias: { fecha: string; huecos: Hueco[] }[] }>(`/citas/disponibilidad?${consulta}`);
  return dias.find((d) => d.fecha === fecha)?.huecos ?? [];
}
