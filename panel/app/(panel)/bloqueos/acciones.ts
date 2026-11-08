'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ErrorDelBackend, llamarAlBackend } from '@/lib/backend';
import { rangoDelBloqueo, type Bloqueo, type CitaAfectada } from '@/lib/bloqueos';
import { esId } from '@/lib/datos';
import { fechaDe, fechaLarga, horaLocal } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';

export interface EstadoBloqueo {
  error?: string;
  /** Al crearlo: qué se bloqueó y qué citas quedaron cruzadas (el backend no las toca). */
  creado?: { afectadas: { id: string; cuando: string; cliente: string }[] };
}

const texto = (datos: FormData, campo: string) => {
  const valor = datos.get(campo);
  return typeof valor === 'string' ? valor.trim() : '';
};

async function pedir<T>(ruta: string, metodo: 'POST' | 'DELETE', cuerpo?: unknown): Promise<{ ok: T } | { error: string }> {
  try {
    return { ok: await llamarAlBackend<T>(ruta, { metodo, ...(cuerpo !== undefined && { cuerpo }) }) };
  } catch (error) {
    if (!(error instanceof ErrorDelBackend)) throw error;
    if (error.estado === 401) redirect('/sesion-vencida');
    return { error: error.message };
  }
}

export async function crearBloqueo(_previo: EstadoBloqueo, datos: FormData): Promise<EstadoBloqueo> {
  const usuario = await exigirUsuario('bloqueos');
  const zona = usuario.negocio.zonaHoraria;
  const rango = rangoDelBloqueo(
    {
      fechaDesde: texto(datos, 'fechaDesde'),
      horaDesde: texto(datos, 'horaDesde'),
      fechaHasta: texto(datos, 'fechaHasta'),
      horaHasta: texto(datos, 'horaHasta'),
      todoElDia: datos.get('todoElDia') === 'si',
    },
    zona,
  );
  if ('error' in rango) return rango;

  // El barbero bloquea su propia agenda (el backend lo fija). El dueño elige: un barbero o todo el negocio.
  let profesionalId: string | null | undefined;
  if (usuario.rol === 'dueno') {
    const elegido = texto(datos, 'profesionalId');
    if (elegido === 'negocio') profesionalId = null;
    else if (esId(elegido)) profesionalId = elegido;
    else return { error: 'Elige a quién bloquear: un barbero o todo el negocio.' };
  }

  const motivo = texto(datos, 'motivo').slice(0, 200);
  const resultado = await pedir<{ bloqueo: Bloqueo; citasAfectadas: CitaAfectada[] }>('/bloqueos', 'POST', {
    ...rango,
    ...(profesionalId !== undefined && { profesionalId }),
    ...(motivo && { motivo }),
  });
  if ('error' in resultado) return resultado;

  revalidatePath('/', 'layout');
  return {
    creado: {
      afectadas: resultado.ok.citasAfectadas.map((c) => ({
        id: c.id,
        cuando: `${fechaLarga(fechaDe(c.inicio, zona))}, ${horaLocal(c.inicio, zona)}`,
        cliente: c.clienteNombre ?? 'Cliente sin nombre',
      })),
    },
  };
}

export async function quitarBloqueo(bloqueoId: string): Promise<{ error?: string }> {
  if (!esId(bloqueoId)) return { error: 'Bloqueo no válido.' };
  const resultado = await pedir<void>(`/bloqueos/${bloqueoId}`, 'DELETE');
  if ('error' in resultado) return resultado;
  revalidatePath('/', 'layout');
  return {};
}
