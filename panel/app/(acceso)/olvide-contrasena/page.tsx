import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Olvidé mi contraseña' };

/** Sin servicio de correo todavía: el dueño genera el enlace desde Usuarios. */
export default function PaginaOlvide() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">¿Olvidaste tu contraseña?</h1>
      <div className="mb-5 flex flex-col gap-3 text-sm text-suave">
        <p>Pídele al dueño de la barbería un enlace para cambiarla. Lo genera desde la sección Usuarios del panel.</p>
        <p>Si eres el dueño, escríbele al equipo de Turnoo.</p>
      </div>
      <Link
        href="/login"
        className="flex min-h-11 items-center justify-center rounded-lg border border-borde font-semibold transition-colors duration-150 hover:bg-fondo"
      >
        Volver a entrar
      </Link>
    </>
  );
}
