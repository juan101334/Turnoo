import type { Metadata } from 'next';
import { cambiarContrasena } from '@/app/(panel)/cuenta/acciones';
import { BotonCerrarSesion } from '@/componentes/cerrar-sesion';
import { SeccionContrasena } from '@/componentes/seccion-contrasena';
import { SelectorDeTema } from '@/componentes/selector-de-tema';
import { exigirSuperadmin } from '@/lib/sesion-superadmin';
import { temaElegido } from '@/lib/tema-servidor';

export const metadata: Metadata = { title: 'Cuenta · Superadmin' };

/** La cuenta del superadmin: la contraseña, el tema y cerrar sesión. */
export default async function PaginaCuentaSuperadmin() {
  const usuario = await exigirSuperadmin();
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-2xl font-semibold">Cuenta</h1>
      <div className="mb-4 rounded-xl border border-borde bg-superficie p-4">
        <p className="text-lg font-medium">{usuario.nombre}</p>
        <p className="text-sm text-suave">Superadmin de Turnoo</p>
      </div>
      <SeccionContrasena accion={cambiarContrasena} ayuda="Al cambiarla se cierra tu sesión en los demás dispositivos." />

      <section aria-labelledby="apariencia" className="mb-4 rounded-xl border border-borde bg-superficie p-4">
        <h2 id="apariencia" className="mb-1 font-semibold">
          Apariencia
        </h2>
        <p className="mb-3 text-sm text-suave">Sistema sigue el modo claro u oscuro de tu celular o computador.</p>
        <SelectorDeTema tema={await temaElegido()} />
      </section>

      <div className="max-w-xs">
        <BotonCerrarSesion />
      </div>
    </div>
  );
}
