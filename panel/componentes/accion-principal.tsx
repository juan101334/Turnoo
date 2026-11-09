import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

/**
 * La acción principal de una pantalla ("Nueva cita", "Bloquear horas", "Invitar"). En el celular
 * flota abajo a la derecha, sobre la barra, donde llega el pulgar; desde 768 px va en el encabezado.
 * Al flotar lleva un borde del color del fondo: en oscuro el azul claro de la marca se fundía con
 * los botones azules de las tarjetas que pasan por debajo.
 */
export function AccionPrincipal({ href, etiqueta, Icono }: { href: string; etiqueta: string; Icono: LucideIcon }) {
  return (
    <Link
      href={href}
      className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex min-h-12 items-center gap-2 rounded-full bg-marca px-5 font-semibold text-white shadow-flotante ring-4 ring-fondo transition-colors duration-150 hover:bg-marca-oscura active:bg-marca-oscura md:static md:min-h-11 md:shrink-0 md:rounded-lg md:px-4 md:shadow-none md:ring-0"
    >
      <Icono aria-hidden className="size-5" />
      {etiqueta}
    </Link>
  );
}
