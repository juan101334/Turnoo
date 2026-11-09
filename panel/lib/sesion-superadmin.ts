import 'server-only';
import { redirect } from 'next/navigation';
import { rutaDeInicio } from './navegacion';
import { tokenDeSesion, usuarioActual, type Usuario } from './sesion';

/** Solo el superadmin: sin sesión, al login; con otro rol, a su inicio. */
export async function exigirSuperadmin(): Promise<Usuario> {
  const usuario = await usuarioActual();
  if (!usuario) redirect((await tokenDeSesion()) ? '/sesion-vencida' : '/login');
  if (usuario.rol !== 'superadmin') redirect(rutaDeInicio(usuario.rol));
  return usuario;
}
