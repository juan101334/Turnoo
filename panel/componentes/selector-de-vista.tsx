import { CalendarDays, CalendarRange } from 'lucide-react';
import Link from 'next/link';

/**
 * Día o semana en la agenda del PC. Son enlaces (?vista=semana), así que la vista se comparte y
 * "atrás" la deshace. Abajo de 1024 px no aparece: en el celular la agenda es del día.
 */
export function SelectorDeVista({
  vista,
  enlaces,
}: {
  vista: 'dia' | 'semana';
  enlaces: { dia: string; semana: string };
}) {
  const opciones = [
    { clave: 'dia', texto: 'Día', Icono: CalendarDays },
    { clave: 'semana', texto: 'Semana', Icono: CalendarRange },
  ] as const;
  return (
    <nav aria-label="Vista" className="hidden shrink-0 lg:block">
      <ul className="flex rounded-lg border border-borde bg-superficie p-0.5">
        {opciones.map(({ clave, texto, Icono }) => {
          const activa = vista === clave;
          return (
            <li key={clave}>
              <Link
                href={enlaces[clave]}
                aria-current={activa ? 'page' : undefined}
                className={`flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors duration-150 ${
                  activa ? 'bg-marca text-white' : 'text-suave hover:bg-fondo hover:text-texto'
                }`}
              >
                <Icono aria-hidden className="size-4" />
                {texto}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
