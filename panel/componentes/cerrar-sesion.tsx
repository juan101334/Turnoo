import { LogOut } from 'lucide-react';
import { cerrarSesion } from '@/app/(acceso)/acciones';

/**
 * Formulario con un solo botón: cerrar sesión es un POST (una Server Action), nunca un enlace.
 * Va solo al final de Cuenta, con el ancho y las esquinas de las tarjetas.
 */
export function BotonCerrarSesion() {
  return (
    <form action={cerrarSesion} className="mt-8">
      <button
        type="submit"
        className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-borde bg-superficie px-4 font-semibold text-peligro transition-colors duration-150 hover:bg-peligro-suave"
      >
        <LogOut aria-hidden className="size-5" />
        Cerrar sesión
      </button>
    </form>
  );
}
