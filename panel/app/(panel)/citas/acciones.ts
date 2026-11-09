'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ErrorDelBackend, llamarAlBackend } from '@/lib/backend';
import type { Accion, Cita } from '@/lib/citas';
import { esId } from '@/lib/datos';

/**
 * Acciones sobre citas. Son endpoints públicos (cualquiera puede llamarlos con un POST), así que
 * validan lo que reciben antes de armar la ruta, y los permisos los decide el backend.
 */

export interface EstadoAccion {
  error?: string;
  listo?: string;
}

const texto = (datos: FormData, campo: string) => {
  const valor = datos.get(campo);
  return typeof valor === 'string' ? valor.trim() : '';
};

/** Llama al backend; un error conocido vuelve como mensaje para mostrar. */
async function pedir<T>(ruta: string, cuerpo: unknown): Promise<{ ok: T } | { error: string }> {
  try {
    return { ok: await llamarAlBackend<T>(ruta, { metodo: 'POST', cuerpo }) };
  } catch (error) {
    if (!(error instanceof ErrorDelBackend)) throw error;
    if (error.estado === 401) redirect('/sesion-vencida');
    return { error: error.message };
  }
}

const RUTAS: Record<Exclude<Accion, 'reprogramar'>, { ruta: string; cuerpo: object; listo: string }> = {
  completar: { ruta: 'marcar', cuerpo: { estado: 'completada' }, listo: 'Cita marcada como completada.' },
  noAsistio: { ruta: 'marcar', cuerpo: { estado: 'no_asistio' }, listo: 'Cita marcada como "no asistió".' },
  cancelar: { ruta: 'cancelar', cuerpo: {}, listo: 'Cita cancelada.' },
  aprobar: { ruta: 'aprobar', cuerpo: {}, listo: 'Cita aprobada.' },
  rechazar: { ruta: 'rechazar', cuerpo: {}, listo: 'Cita rechazada.' },
};

export async function accionSobreCita(citaId: string, _previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const accion = texto(datos, 'accion');
  if (!esId(citaId) || !Object.hasOwn(RUTAS, accion)) return { error: 'Acción no válida.' };
  const { ruta, cuerpo, listo } = RUTAS[accion as keyof typeof RUTAS];
  const resultado = await pedir<Cita>(`/citas/${citaId}/${ruta}`, cuerpo);
  if ('error' in resultado) return resultado;
  revalidatePath('/', 'layout');
  return { listo };
}

/**
 * "Completada" desde la tarjeta de la agenda. El panel la manda cuando se acaba el tiempo para
 * deshacer (o al salir de la pantalla): el backend no permite volver una cita a "pendiente".
 */
export async function completarCita(citaId: string): Promise<EstadoAccion> {
  if (!esId(citaId)) return { error: 'Acción no válida.' };
  const resultado = await pedir<Cita>(`/citas/${citaId}/marcar`, RUTAS.completar.cuerpo);
  if ('error' in resultado) return resultado;
  revalidatePath('/', 'layout');
  return { listo: RUTAS.completar.listo };
}

export async function reprogramarCita(citaId: string, _previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const inicio = texto(datos, 'inicio');
  if (!esId(citaId)) return { error: 'Acción no válida.' };
  if (!inicio) return { error: 'Elige la hora nueva.' };
  const resultado = await pedir<Cita>(`/citas/${citaId}/reprogramar`, { inicio });
  if ('error' in resultado) return resultado;
  revalidatePath('/', 'layout');
  redirect(`/citas/${citaId}?listo=reprogramada`);
}

export async function crearCita(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const profesionalId = texto(datos, 'profesionalId');
  const servicioIds = datos.getAll('servicioIds').filter((v): v is string => typeof v === 'string');
  const inicio = texto(datos, 'inicio');
  const telefono = texto(datos, 'telefono');
  const nombre = texto(datos, 'nombre');
  const notas = texto(datos, 'notas');

  if (!esId(profesionalId) || servicioIds.length === 0 || !servicioIds.every(esId)) return { error: 'Elige el barbero y al menos un servicio.' };
  if (!inicio) return { error: 'Elige la hora de la cita.' };
  if (!telefono) return { error: 'Escribe el teléfono del cliente.' };

  const resultado = await pedir<Cita>('/citas', {
    profesionalId,
    servicioIds,
    inicio,
    cliente: { telefono, ...(nombre && { nombre }) },
    ...(notas && { notas }),
  });
  if ('error' in resultado) return resultado;
  revalidatePath('/', 'layout');
  redirect(`/citas/${resultado.ok.id}?listo=creada`);
}
