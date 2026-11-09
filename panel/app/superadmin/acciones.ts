'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { pedir, texto, type EstadoFormulario } from '@/lib/acciones';
import { esId } from '@/lib/datos';
import { fechaDe, fechaLarga, horaLocal } from '@/lib/fechas';
import type { EstadoNegocio } from '@/lib/plan';

/**
 * Acciones del superadmin sobre la plataforma. Los permisos y las reglas los aplica el backend
 * (solo el superadmin entra a /negocios); aquí se valida la forma antes de armar la ruta.
 */

export interface ResultadoEnlace {
  error?: string;
  enlace?: { url: string; vence: string };
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_META = /^\d{1,30}$/;
const ESTADOS: EstadoNegocio[] = ['prueba', 'activo', 'suspendido'];

function refrescar() {
  revalidatePath('/superadmin', 'layout');
}

async function venceEn(negocioId: string, expiraEn: string): Promise<string> {
  const n = await pedir<{ zonaHoraria: string }>(`/negocios/${negocioId}`, 'GET');
  const zona = 'ok' in n ? n.ok.zonaHoraria : 'America/Bogota';
  return `${fechaLarga(fechaDe(expiraEn, zona))} a las ${horaLocal(expiraEn, zona)}`;
}

/** Negocio nuevo, en prueba (la base le crea su sede y su configuración). */
export async function crearNegocio(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const nombre = texto(datos, 'nombre');
  const zonaHoraria = texto(datos, 'zonaHoraria');
  const telefonoAvisos = texto(datos, 'telefonoAvisos');
  if (!nombre) return { error: 'Escribe el nombre del negocio.' };
  const r = await pedir<{ id: string }>('/negocios', 'POST', {
    nombre,
    ...(zonaHoraria && { zonaHoraria }),
    ...(telefonoAvisos && { telefonoAvisos }),
  });
  if ('error' in r) return r;
  refrescar();
  redirect(`/superadmin/negocios/${r.ok.id}?listo=creado`);
}

/** Prueba, activo o suspendido. Suspendido: el negocio entra y consulta, pero no cambia nada. */
export async function cambiarEstado(negocioId: string, estado: EstadoNegocio): Promise<{ error?: string; listo?: string }> {
  if (!esId(negocioId) || !ESTADOS.includes(estado)) return { error: 'Cambio no válido.' };
  const r = await pedir(`/negocios/${negocioId}`, 'PATCH', { estado });
  if ('error' in r) return r;
  refrescar();
  return { listo: estado === 'suspendido' ? 'Negocio suspendido.' : estado === 'activo' ? 'Negocio activo.' : 'Negocio en prueba.' };
}

/**
 * Conecta un número de WhatsApp (los datos salen del panel de Meta). El token viaja una sola vez
 * al backend, que lo guarda cifrado y nunca lo devuelve; el panel no lo guarda ni lo muestra.
 */
export async function registrarWhatsapp(negocioId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  if (!esId(negocioId)) return { error: 'Negocio no válido.' };
  const phoneNumberId = texto(datos, 'phoneNumberId');
  const wabaId = texto(datos, 'wabaId');
  const numeroVisible = texto(datos, 'numeroVisible');
  const token = texto(datos, 'token');
  if (!ID_META.test(phoneNumberId) || !ID_META.test(wabaId)) return { error: 'El Phone number ID y el WABA ID son los números que muestra Meta.' };
  if (!numeroVisible) return { error: 'Escribe el número de WhatsApp como lo ven los clientes.' };
  if (!token) return { error: 'Pega el token de acceso de Meta.' };
  const r = await pedir(`/negocios/${negocioId}/whatsapp`, 'POST', { phoneNumberId, wabaId, numeroVisible, token });
  if ('error' in r) return r;
  refrescar();
  return { listo: 'Número de WhatsApp conectado.' };
}

/** Cambiar el token de una cuenta (rotarlo). El anterior deja de usarse. */
export async function cambiarTokenWhatsapp(negocioId: string, cuentaId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  if (!esId(negocioId) || !esId(cuentaId)) return { error: 'Cuenta no válida.' };
  const token = texto(datos, 'token');
  if (!token) return { error: 'Pega el token nuevo.' };
  const r = await pedir(`/negocios/${negocioId}/whatsapp/${cuentaId}`, 'PATCH', { token });
  if ('error' in r) return r;
  refrescar();
  return { listo: 'Token cambiado.' };
}

/** Desactivar hace que el webhook ignore ese número (el asistente deja de responder por él). */
export async function cambiarWhatsappActiva(negocioId: string, cuentaId: string, activa: boolean): Promise<{ error?: string; listo?: string }> {
  if (!esId(negocioId) || !esId(cuentaId)) return { error: 'Cuenta no válida.' };
  const r = await pedir(`/negocios/${negocioId}/whatsapp/${cuentaId}`, 'PATCH', { activa });
  if ('error' in r) return r;
  refrescar();
  return { listo: activa ? 'Número activado.' : 'Número desactivado.' };
}

/** Invita al dueño del negocio: devuelve el enlace para pasárselo (no se guarda en el panel). */
export async function invitarDueno(negocioId: string, _previo: ResultadoEnlace, datos: FormData): Promise<ResultadoEnlace> {
  if (!esId(negocioId)) return { error: 'Negocio no válido.' };
  const nombre = texto(datos, 'nombre');
  const email = texto(datos, 'email');
  if (!nombre) return { error: 'Escribe el nombre del dueño.' };
  if (!CORREO.test(email)) return { error: 'Escribe un correo válido.' };
  const r = await pedir<{ enlace: string; expiraEn: string }>('/auth/usuarios/invitar', 'POST', { nombre, email, rol: 'dueno', negocioId });
  if ('error' in r) return r;
  refrescar();
  return { enlace: { url: r.ok.enlace, vence: await venceEn(negocioId, r.ok.expiraEn) } };
}

/** Enlace nuevo de invitación (pendiente o desactivado) o de contraseña (activo). Anula los anteriores. */
export async function enlaceDeUsuario(negocioId: string, usuarioId: string, tipo: 'reenviarInvitacion' | 'recuperacion'): Promise<ResultadoEnlace> {
  if (!esId(negocioId) || !esId(usuarioId)) return { error: 'Usuario no válido.' };
  const ruta = tipo === 'recuperacion' ? 'recuperacion' : 'reenviar-invitacion';
  const r = await pedir<{ enlace: string; expiraEn: string }>(`/auth/usuarios/${usuarioId}/${ruta}`, 'POST', { negocioId });
  if ('error' in r) return r;
  refrescar();
  return { enlace: { url: r.ok.enlace, vence: await venceEn(negocioId, r.ok.expiraEn) } };
}

/** Cierra sus sesiones y anula sus enlaces. */
export async function desactivarUsuarioDelNegocio(negocioId: string, usuarioId: string): Promise<{ error?: string; listo?: string }> {
  if (!esId(negocioId) || !esId(usuarioId)) return { error: 'Usuario no válido.' };
  const r = await pedir(`/auth/usuarios/${usuarioId}/desactivar`, 'POST', { negocioId });
  if ('error' in r) return r;
  refrescar();
  return { listo: 'Usuario desactivado.' };
}
