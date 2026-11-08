'use server';

import { revalidatePath } from 'next/cache';
import { pedir, texto } from '@/lib/acciones';
import { esId } from '@/lib/datos';
import { fechaDe, fechaLarga, horaLocal } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';

/**
 * Usuarios del panel. Los enlaces (invitación y recuperación) se devuelven UNA vez para que el
 * dueño se los pase a la persona; el panel no los guarda ni los pone en la URL.
 */

export interface ResultadoEnlace {
  error?: string;
  enlace?: { url: string; vence: string };
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function venceEn(expiraEn: string): Promise<string> {
  const zona = (await exigirUsuario('usuarios')).negocio.zonaHoraria;
  return `${fechaLarga(fechaDe(expiraEn, zona))} a las ${horaLocal(expiraEn, zona)}`;
}

export async function invitarUsuario(_previo: ResultadoEnlace, datos: FormData): Promise<ResultadoEnlace> {
  const nombre = texto(datos, 'nombre');
  const email = texto(datos, 'email');
  const rol = texto(datos, 'rol');
  const profesionalId = texto(datos, 'profesionalId');
  if (!nombre) return { error: 'Escribe el nombre de la persona.' };
  if (!CORREO.test(email)) return { error: 'Escribe un correo válido.' };
  if (rol !== 'empleado' && rol !== 'dueno') return { error: 'Elige si es barbero o dueño.' };
  if (rol === 'empleado' && !esId(profesionalId)) return { error: 'Elige con qué barbero atiende: sin eso no vería ninguna cita.' };
  if (profesionalId && !esId(profesionalId)) return { error: 'Barbero no válido.' };

  const r = await pedir<{ enlace: string; expiraEn: string }>('/auth/usuarios/invitar', 'POST', {
    nombre,
    email,
    rol,
    ...(profesionalId && { profesionalId }),
  });
  if ('error' in r) return r;
  revalidatePath('/', 'layout');
  return { enlace: { url: r.ok.enlace, vence: await venceEn(r.ok.expiraEn) } };
}

/** Nuevo enlace de invitación (pendiente o desactivado) o de recuperación (activo). Anula los anteriores. */
export async function generarEnlace(usuarioId: string, tipo: 'reenviarInvitacion' | 'recuperacion'): Promise<ResultadoEnlace> {
  if (!esId(usuarioId)) return { error: 'Usuario no válido.' };
  const ruta = tipo === 'recuperacion' ? 'recuperacion' : 'reenviar-invitacion';
  const r = await pedir<{ enlace: string; expiraEn: string }>(`/auth/usuarios/${usuarioId}/${ruta}`, 'POST', {});
  if ('error' in r) return r;
  revalidatePath('/', 'layout');
  return { enlace: { url: r.ok.enlace, vence: await venceEn(r.ok.expiraEn) } };
}

/** Cierra sus sesiones y anula sus enlaces. Se reactiva con una invitación nueva. */
export async function desactivarUsuario(usuarioId: string): Promise<{ error?: string; listo?: string }> {
  if (!esId(usuarioId)) return { error: 'Usuario no válido.' };
  const r = await pedir(`/auth/usuarios/${usuarioId}/desactivar`, 'POST', {});
  if ('error' in r) return r;
  revalidatePath('/', 'layout');
  return { listo: 'Usuario desactivado.' };
}
