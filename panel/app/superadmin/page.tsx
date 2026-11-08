import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BotonCerrarSesion } from '@/componentes/cerrar-sesion';
import { rutaDeInicio } from '@/lib/navegacion';
import { tokenDeSesion, usuarioActual } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Superadmin' };

/** El superadmin no tiene panel en la versión 1: los negocios se administran con la API. */
export default async function PaginaSuperadmin() {
  const usuario = await usuarioActual();
  if (!usuario) redirect((await tokenDeSesion()) ? '/sesion-vencida' : '/login');
  if (usuario.rol !== 'superadmin') redirect(rutaDeInicio(usuario.rol));
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-borde bg-superficie p-6">
        <h1 className="mb-2 text-xl font-semibold">Hola, {usuario.nombre}</h1>
        <p className="mb-6 text-sm text-suave">
          El panel del superadmin todavía no existe. Los negocios, sus dueños y sus cuentas de WhatsApp se administran con la API.
        </p>
        <BotonCerrarSesion />
      </div>
    </main>
  );
}
