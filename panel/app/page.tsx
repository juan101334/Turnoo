import { redirect } from 'next/navigation';
import { rutaDeInicio } from '@/lib/navegacion';
import { usuarioActual } from '@/lib/sesion';

export default async function Inicio() {
  const usuario = await usuarioActual();
  redirect(usuario ? rutaDeInicio(usuario.rol) : '/login');
}
