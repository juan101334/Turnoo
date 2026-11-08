'use server';

import { redirect } from 'next/navigation';
import { ErrorDelBackend, llamarAlBackend } from '@/lib/backend';
import { CLAVE_MAX, CLAVE_MIN } from '@/lib/claves';
import { rutaDeInicio, type Rol } from '@/lib/navegacion';
import { borrarSesion, guardarSesion, tokenDeSesion } from '@/lib/sesion';

export interface EstadoFormulario {
  error?: string;
  /** El correo vuelve al formulario para no tener que escribirlo de nuevo. */
  email?: string;
}

const texto = (datos: FormData, campo: string) => {
  const valor = datos.get(campo);
  return typeof valor === 'string' ? valor : '';
};

export async function iniciarSesion(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const email = texto(datos, 'email').trim();
  const password = texto(datos, 'password');
  if (!email || !password) return { error: 'Escribe tu correo y tu contraseña.', email };

  let sesion: { token: string; expiraEn: string; usuario: { rol: Rol } };
  try {
    sesion = await llamarAlBackend('/auth/login', { metodo: 'POST', cuerpo: { email, password }, conSesion: false });
  } catch (error) {
    if (!(error instanceof ErrorDelBackend)) throw error;
    // El backend responde lo mismo si el correo no existe: así nadie averigua qué cuentas hay.
    return { error: error.estado === 401 ? 'El correo o la contraseña no son correctos.' : error.message, email };
  }
  await guardarSesion(sesion.token, new Date(sesion.expiraEn));
  redirect(rutaDeInicio(sesion.usuario.rol));
}

export async function cerrarSesion(): Promise<void> {
  if (await tokenDeSesion()) {
    // Se revoca en el backend; si falla (ya vencida, sin conexión), igual se borra la cookie.
    await llamarAlBackend('/auth/logout', { metodo: 'POST' }).catch(() => undefined);
  }
  await borrarSesion();
  redirect('/login');
}

/** Valida la contraseña nueva igual que el backend, para avisar antes de enviarla. */
function revisarClaveNueva(datos: FormData): { token: string; password: string } | { error: string } {
  const token = texto(datos, 'token');
  const password = texto(datos, 'password');
  if (!token) return { error: 'El enlace no es válido o está incompleto. Pide uno nuevo.' };
  if (password.length < CLAVE_MIN || password.length > CLAVE_MAX) {
    return { error: `La contraseña debe tener entre ${CLAVE_MIN} y ${CLAVE_MAX} caracteres.` };
  }
  if (password !== texto(datos, 'confirmacion')) return { error: 'Las dos contraseñas no coinciden.' };
  return { token, password };
}

async function definirClave(ruta: '/auth/aceptar-invitacion' | '/auth/restablecer', datos: FormData, listo: string): Promise<EstadoFormulario> {
  const revisada = revisarClaveNueva(datos);
  if ('error' in revisada) return revisada;
  try {
    await llamarAlBackend(ruta, { metodo: 'POST', cuerpo: revisada, conSesion: false });
  } catch (error) {
    if (!(error instanceof ErrorDelBackend)) throw error;
    return {
      error: error.estado === 401 ? 'El enlace ya se usó o venció. Pide uno nuevo al dueño del negocio.' : error.message,
    };
  }
  redirect(`/login?listo=${listo}`);
}

export async function aceptarInvitacion(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  return definirClave('/auth/aceptar-invitacion', datos, 'invitacion');
}

export async function restablecerContrasena(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  return definirClave('/auth/restablecer', datos, 'contrasena');
}
