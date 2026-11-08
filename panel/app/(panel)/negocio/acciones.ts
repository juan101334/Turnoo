'use server';

import { revalidatePath } from 'next/cache';
import { pedir, texto, type EstadoFormulario } from '@/lib/acciones';
import { cambiosDeConfiguracion, type ClaveConfiguracion, type Configuracion } from '@/lib/administracion';
import type { MiNegocio } from '@/lib/datos';

/** Datos y reglas del negocio de la sesión. Solo el dueño: el backend responde 403 a los demás. */

export async function guardarDatos(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const nombre = texto(datos, 'nombre');
  const telefonoAvisos = texto(datos, 'telefonoAvisos');
  const zonaHoraria = texto(datos, 'zonaHoraria');
  if (!nombre) return { error: 'Escribe el nombre del negocio.' };
  if (!zonaHoraria) return { error: 'Elige la zona horaria.' };
  // Vacío = sin teléfono de avisos (null). El backend lo normaliza y valida.
  const r = await pedir('/negocio', 'PATCH', { nombre, telefonoAvisos: telefonoAvisos || null, zonaHoraria });
  if ('error' in r) return r;
  revalidatePath('/', 'layout');
  return { listo: 'Datos guardados.' };
}

/** Se envía solo lo que cambió, comparado con lo que tiene el backend ahora. */
export async function guardarConfiguracion(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const actual = await pedir<MiNegocio>('/negocio', 'GET');
  if ('error' in actual) return actual;
  const resultado = cambiosDeConfiguracion((clave: ClaveConfiguracion) => texto(datos, clave), actual.ok.configuracion);
  if ('error' in resultado) return resultado;
  if (Object.keys(resultado.cambios).length === 0) return { listo: 'No había cambios para guardar.' };
  const r = await pedir<Configuracion>('/negocio/configuracion', 'PATCH', resultado.cambios);
  if ('error' in r) return r;
  revalidatePath('/', 'layout');
  return { listo: 'Reglas guardadas.' };
}
