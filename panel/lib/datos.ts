import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { ErrorDelBackend, llamarAlBackend } from './backend';
import type { Cita } from './citas';
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

export async function citasDelDia(fecha: string, zona: string, profesionalId?: string): Promise<Cita[]> {
  const { desde, hasta } = limitesDelDia(fecha, zona);
  const consulta = new URLSearchParams({ desde, hasta, ...(profesionalId && { profesionalId }) });
  return (await leer<{ citas: Cita[] }>(`/citas?${consulta}`)).citas;
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
