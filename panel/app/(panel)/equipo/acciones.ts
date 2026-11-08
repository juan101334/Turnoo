'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { pedir, texto, type EstadoFormulario } from '@/lib/acciones';
import { leerEntero, leerPesos, nombreDelDia, horaLegible } from '@/lib/administracion';
import type { CitaAfectada } from '@/lib/bloqueos';
import { esId } from '@/lib/datos';
import { fechaDe, fechaLarga, horaLocal } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';

/** Barberos, sus servicios y su horario semanal. Solo el dueño; el backend también lo exige. */

const NO_VALIDO = { error: 'Barbero no válido.' };
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function refrescar() {
  revalidatePath('/', 'layout');
}

export async function crearBarbero(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const nombre = texto(datos, 'nombre');
  if (!nombre) return { error: 'Escribe el nombre del barbero.' };
  const r = await pedir<{ id: string }>('/profesionales', 'POST', { nombre });
  if ('error' in r) return r;
  refrescar();
  redirect(`/equipo/${r.ok.id}?listo=creado`);
}

export async function renombrarBarbero(id: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  if (!esId(id)) return NO_VALIDO;
  const nombre = texto(datos, 'nombre');
  if (!nombre) return { error: 'Escribe el nombre del barbero.' };
  const r = await pedir(`/profesionales/${id}`, 'PATCH', { nombre });
  if ('error' in r) return r;
  refrescar();
  return { listo: 'Nombre guardado.' };
}

export async function cambiarBarberoActivo(id: string, activo: boolean): Promise<EstadoFormulario> {
  if (!esId(id)) return NO_VALIDO;
  const r = await pedir(`/profesionales/${id}/${activo ? 'activar' : 'desactivar'}`, 'POST');
  if ('error' in r) return r;
  refrescar();
  return { listo: activo ? 'Barbero activado.' : 'Barbero desactivado.' };
}

/** Quién entra al panel como este barbero. '' = nadie. */
export async function asignarUsuario(id: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  if (!esId(id)) return NO_VALIDO;
  const elegido = texto(datos, 'usuarioId');
  if (elegido && !esId(elegido)) return { error: 'Usuario no válido.' };
  const r = await pedir(`/profesionales/${id}/usuario`, 'PUT', { usuarioId: elegido || null });
  if ('error' in r) return r;
  refrescar();
  return { listo: elegido ? 'Usuario asignado.' : 'El barbero quedó sin usuario.' };
}

/** Nombre, duración y precio, con los mensajes en palabras del dueño. */
function servicioDelFormulario(datos: FormData): { nombre: string; duracionMinutos: number; precioCop: number } | { error: string } {
  const nombre = texto(datos, 'nombre');
  const duracionMinutos = leerEntero(texto(datos, 'duracion'));
  const precioCop = leerPesos(texto(datos, 'precio'));
  if (!nombre) return { error: 'Escribe el nombre del servicio.' };
  if (duracionMinutos === null || duracionMinutos < 1 || duracionMinutos > 480) return { error: 'La duración va en minutos, entre 1 y 480.' };
  if (precioCop === null) return { error: 'Escribe el precio, por ejemplo 25.000.' };
  return { nombre, duracionMinutos, precioCop };
}

export async function crearServicio(barberoId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  if (!esId(barberoId)) return NO_VALIDO;
  const servicio = servicioDelFormulario(datos);
  if ('error' in servicio) return servicio;
  const r = await pedir(`/profesionales/${barberoId}/servicios`, 'POST', servicio);
  if ('error' in r) return r;
  refrescar();
  return { listo: `Servicio "${servicio.nombre}" agregado.` };
}

export async function editarServicio(barberoId: string, servicioId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  if (!esId(barberoId) || !esId(servicioId)) return { error: 'Servicio no válido.' };
  const servicio = servicioDelFormulario(datos);
  if ('error' in servicio) return servicio;
  const r = await pedir(`/profesionales/${barberoId}/servicios/${servicioId}`, 'PATCH', servicio);
  if ('error' in r) return r;
  refrescar();
  redirect(`/equipo/${barberoId}?listo=servicio`);
}

export async function cambiarServicioActivo(barberoId: string, servicioId: string, activo: boolean): Promise<EstadoFormulario> {
  if (!esId(barberoId) || !esId(servicioId)) return { error: 'Servicio no válido.' };
  const r = await pedir(`/profesionales/${barberoId}/servicios/${servicioId}/${activo ? 'activar' : 'desactivar'}`, 'POST');
  if ('error' in r) return r;
  refrescar();
  return {};
}

export async function crearHorario(barberoId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  if (!esId(barberoId)) return NO_VALIDO;
  const diaSemana = leerEntero(texto(datos, 'dia'));
  const horaInicio = texto(datos, 'desde');
  const horaFin = texto(datos, 'hasta');
  if (diaSemana === null || diaSemana < 1 || diaSemana > 7) return { error: 'Elige el día.' };
  if (!HORA.test(horaInicio) || !HORA.test(horaFin)) return { error: 'Escribe la hora de inicio y la de fin.' };
  if (horaInicio >= horaFin) return { error: 'El horario debe empezar antes de terminar.' };
  const r = await pedir(`/profesionales/${barberoId}/horarios`, 'POST', { diaSemana, horaInicio, horaFin });
  if ('error' in r) return r;
  refrescar();
  return { listo: `${nombreDelDia(diaSemana)}: ${horaLegible(horaInicio)} a ${horaLegible(horaFin)} agregado.` };
}

export interface ResultadoQuitarHorario {
  error?: string;
  /** Citas activas que quedaron fuera del horario: siguen agendadas, el dueño decide. */
  afectadas?: { id: string; texto: string }[];
}

/** Quita un rango. Las citas que quedan fuera no se tocan: se listan para que el dueño decida. */
export async function quitarHorario(barberoId: string, horarioId: string): Promise<ResultadoQuitarHorario> {
  if (!esId(barberoId) || !esId(horarioId)) return { error: 'Horario no válido.' };
  const usuario = await exigirUsuario('equipo');
  const r = await pedir<{ citasAfectadas: CitaAfectada[] }>(`/profesionales/${barberoId}/horarios/${horarioId}`, 'DELETE');
  if ('error' in r) return r;
  refrescar();
  const zona = usuario.negocio.zonaHoraria;
  return {
    afectadas: r.ok.citasAfectadas.map((c) => ({
      id: c.id,
      texto: `${fechaLarga(fechaDe(c.inicio, zona))}, ${horaLocal(c.inicio, zona)} · ${c.clienteNombre ?? 'Cliente sin nombre'}`,
    })),
  };
}
