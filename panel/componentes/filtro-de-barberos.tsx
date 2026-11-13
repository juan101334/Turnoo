import Link from 'next/link';
import type { Barbero } from '@/lib/datos';
import { FilaDeslizable } from './fila-deslizable';

/**
 * Para el dueño: ver la agenda de todo el equipo o la de un barbero. Son enlaces (?barbero=), así
 * que el filtro se comparte, sobrevive al recargar y "atrás" lo deshace.
 */
export function FiltroDeBarberos({
  barberos,
  elegido,
  enlace,
  todosSoloEnCelular = false,
}: {
  barberos: Barbero[];
  elegido: string | undefined;
  enlace: (barbero?: string) => string;
  /** En la vista de semana: en el PC la semana es de un barbero, así que "Todos" solo queda abajo de 1024 px. */
  todosSoloEnCelular?: boolean;
}) {
  const opciones = [{ id: undefined, nombre: 'Todos' }, ...barberos];
  return (
    <FilaDeslizable etiqueta="Barbero">
      <ul className="flex gap-2">
        {opciones.map((b) => {
          const activo = b.id === elegido;
          return (
            <li key={b.id ?? 'todos'} className={`shrink-0 ${b.id === undefined && todosSoloEnCelular ? 'lg:hidden' : ''}`}>
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
    </FilaDeslizable>
  );
}
