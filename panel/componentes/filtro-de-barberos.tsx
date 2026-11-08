import Link from 'next/link';
import type { Barbero } from '@/lib/datos';

/**
 * Para el dueño: ver la agenda de todo el equipo o la de un barbero. Son enlaces (?barbero=), así
 * que el filtro se comparte, sobrevive al recargar y "atrás" lo deshace.
 */
export function FiltroDeBarberos({ barberos, elegido, enlace }: { barberos: Barbero[]; elegido: string | undefined; enlace: (barbero?: string) => string }) {
  const opciones = [{ id: undefined, nombre: 'Todos' }, ...barberos];
  return (
    <nav aria-label="Barbero" className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:px-0">
      <ul className="flex gap-2">
        {opciones.map((b) => {
          const activo = b.id === elegido;
          return (
            <li key={b.id ?? 'todos'}>
              <Link
                href={enlace(b.id)}
                aria-current={activo ? 'true' : undefined}
                className={`flex min-h-11 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
                  activo ? 'border-marca bg-marca text-white' : 'border-borde bg-superficie hover:bg-fondo'
                }`}
              >
                {b.nombre}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
