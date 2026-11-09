import type { Metadata } from 'next';
import { BotonCerrarSesion } from '@/componentes/cerrar-sesion';
import { SeccionContrasena } from '@/componentes/seccion-contrasena';
import { SelectorDeTema } from '@/componentes/selector-de-tema';
import { exigirUsuario } from '@/lib/sesion';
import { temaElegido } from '@/lib/tema-servidor';
import { cambiarContrasena } from './acciones';

export const metadata: Metadata = { title: 'Cuenta' };

const ROLES = { dueno: 'Dueño del negocio', empleado: 'Barbero', superadmin: 'Superadmin' } as const;

/** Quién eres, tu contraseña, el tema y cerrar sesión. */
export default async function PaginaCuenta() {
  const usuario = await exigirUsuario('cuenta');
  return (
    <div className="ancho-formulario">
      <h1 className="mb-4 text-2xl font-semibold">Cuenta</h1>
      <div className="mb-4 rounded-xl border border-borde bg-superficie p-4">
        <p className="text-lg font-medium">{usuario.nombre}</p>
        <p className="text-sm text-suave">
          {ROLES[usuario.rol]} · {usuario.negocio.nombre}
        </p>
      </div>

      <SeccionContrasena accion={cambiarContrasena} ayuda="Al cambiarla se cierra tu sesión en los demás celulares y computadores. Aquí sigues dentro." />

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
