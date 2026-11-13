'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ErrorDelBackend, llamarAlBackend } from '@/lib/backend';
import { MAXIMO_POR_LOTE, type Accion, type Cita } from '@/lib/citas';
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

/**
 * Una acción sobre varias citas. El backend no tiene endpoints por lotes: se mandan de una en una,
 * en orden, y se devuelven las que fallaron con su motivo para reintentar solo esas. Una cita que
 * falla no detiene a las demás. Se revalida una sola vez al final.
 */
async function enLote(citaIds: string[], ruta: string, cuerpo: object): Promise<{ fallidas: { id: string; error: string }[] }> {
  if (!Array.isArray(citaIds) || citaIds.length === 0 || citaIds.length > MAXIMO_POR_LOTE || !citaIds.every(esId)) {
    return { fallidas: (Array.isArray(citaIds) ? citaIds : []).map((id) => ({ id: String(id), error: 'Acción no válida.' })) };
  }
  const fallidas: { id: string; error: string }[] = [];
  for (const id of new Set(citaIds)) {
    const resultado = await pedir<Cita>(`/citas/${id}/${ruta}`, cuerpo);
    if ('error' in resultado) fallidas.push({ id, error: resultado.error });
  }
  revalidatePath('/', 'layout');
  return { fallidas };
}

/** "Marcar pasadas como completadas" en Hoy. */
export async function completarCitas(citaIds: string[]) {
  return enLote(citaIds, 'marcar', RUTAS.completar.cuerpo);
}

/** "Aprobar todas" en Por aprobar. Cada cliente recibe el aviso de su cita aprobada. */
export async function aprobarCitas(citaIds: string[]) {
  return enLote(citaIds, 'aprobar', RUTAS.aprobar.cuerpo);
}

/** "Aprobar" desde la lista de por aprobar, cuando se acaba el tiempo para deshacer. */
export async function aprobarCitaDiferida(citaId: string): Promise<EstadoAccion> {
  if (!esId(citaId)) return { error: 'Acción no válida.' };
  const resultado = await pedir<Cita>(`/citas/${citaId}/aprobar`, RUTAS.aprobar.cuerpo);
  if ('error' in resultado) return resultado;
  revalidatePath('/', 'layout');
  return { listo: RUTAS.aprobar.listo };
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

/**
 * Nueva cita. El cliente llega de dos formas: uno que ya existe (`clienteId`: su teléfono se busca
 * aquí, en el servidor, para que nunca viaje en la URL) o uno nuevo (`telefono` y `nombre`). El
 * backend agenda por teléfono: si ya hay un cliente con ese número, usa ese.
 */
export async function crearCita(_previo: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const profesionalId = texto(datos, 'profesionalId');
  const servicioIds = datos.getAll('servicioIds').filter((v): v is string => typeof v === 'string');
  const inicio = texto(datos, 'inicio');
  const clienteId = texto(datos, 'clienteId');
  const nombre = texto(datos, 'nombre');
  const notas = texto(datos, 'notas');

  if (!esId(profesionalId) || servicioIds.length === 0 || !servicioIds.every(esId)) return { error: 'Elige el barbero y al menos un servicio.' };
  if (!inicio) return { error: 'Elige la hora de la cita.' };

  let telefono = texto(datos, 'telefono');
  if (clienteId) {
    if (!esId(clienteId)) return { error: 'Elige el cliente otra vez.' };
    const cliente = await pedirCliente(clienteId);
    if ('error' in cliente) return cliente;
    if (!cliente.ok.telefono) return { error: 'Este cliente no tiene teléfono guardado: agéndalo como cliente nuevo con su número.' };
    telefono = cliente.ok.telefono;
  }
  if (!telefono) return { error: 'Escribe el teléfono del cliente.' };

  const resultado = await pedir<Cita>('/citas', {
    profesionalId,
    servicioIds,
    inicio,
    cliente: { telefono, ...(!clienteId && nombre && { nombre }) },
    ...(notas && { notas }),
  });
  if ('error' in resultado) return resultado;
  revalidatePath('/', 'layout');
  redirect(`/citas/${resultado.ok.id}?listo=creada`);
}

async function pedirCliente(clienteId: string): Promise<{ ok: { telefono: string | null } } | { error: string }> {
  try {
    return { ok: await llamarAlBackend<{ telefono: string | null }>(`/clientes/${clienteId}`) };
  } catch (error) {
    if (!(error instanceof ErrorDelBackend)) throw error;
    if (error.estado === 401) redirect('/sesion-vencida');
    return { error: error.estado === 404 ? 'Ese cliente ya no existe. Búscalo otra vez.' : error.message };
  }
}
