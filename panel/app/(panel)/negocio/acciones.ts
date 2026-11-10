'use server';

import { revalidatePath } from 'next/cache';
import { pedir, texto } from '@/lib/acciones';
import { cambiosDeConfiguracion, type Configuracion } from '@/lib/administracion';
import { valoresDeConfiguracion, type ParteDeAjustes, type ResultadoAjustes, type ResultadoParte } from '@/lib/ajustes';
import type { MiNegocio } from '@/lib/datos';

/** Datos y reglas del negocio de la sesión. Solo el dueño: el backend responde 403 a los demás. */

const PARTES: readonly ParteDeAjustes[] = ['datos', 'reglas'];

async function guardarDatos(datos: FormData): Promise<ResultadoParte> {
  const nombre = texto(datos, 'nombre');
  const telefonoAvisos = texto(datos, 'telefonoAvisos');
  const zonaHoraria = texto(datos, 'zonaHoraria');
  if (!nombre) return { error: 'Escribe el nombre del negocio.' };
  if (!zonaHoraria) return { error: 'Elige la zona horaria.' };
  // Vacío = sin teléfono de avisos (null). El backend lo normaliza y valida.
  const r = await pedir<MiNegocio['negocio']>('/negocio', 'PATCH', { nombre, telefonoAvisos: telefonoAvisos || null, zonaHoraria });
  if ('error' in r) return r;
  const n = r.ok;
  return { valores: { nombre: n.nombre, telefonoAvisos: n.telefonoAvisos ? `+${n.telefonoAvisos}` : '', zonaHoraria: n.zonaHoraria } };
}

/** Se envía solo lo que cambió, comparado con lo que tiene el backend ahora (rechaza un cambio vacío). */
async function guardarReglas(datos: FormData): Promise<ResultadoParte> {
  const actual = await pedir<MiNegocio>('/negocio', 'GET');
  if ('error' in actual) return actual;
  const resultado = cambiosDeConfiguracion((clave) => texto(datos, clave), actual.ok.configuracion);
  if ('error' in resultado) return resultado;
  if (Object.keys(resultado.cambios).length === 0) return { valores: valoresDeConfiguracion(actual.ok.configuracion) };
  const r = await pedir<Configuracion>('/negocio/configuracion', 'PATCH', resultado.cambios);
  if ('error' in r) return r;
  return { valores: valoresDeConfiguracion(r.ok) };
}

/**
 * Guarda Ajustes con un solo botón, en dos partes independientes (`partes`: las que tienen
 * cambios). Si una falla, la otra queda guardada; la pantalla dice cuál y reintenta solo esa.
 */
export async function guardarAjustes(partes: unknown, datos: FormData): Promise<ResultadoAjustes> {
  const pedidas = PARTES.filter((p) => Array.isArray(partes) && partes.includes(p));
  const resultado: ResultadoAjustes = {};
  if (pedidas.includes('datos')) resultado.datos = await guardarDatos(datos);
  if (pedidas.includes('reglas')) resultado.reglas = await guardarReglas(datos);
  if (Object.values(resultado).some((r) => 'valores' in r)) revalidatePath('/', 'layout');
  return resultado;
}
