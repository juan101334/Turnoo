import Link from 'next/link';
import { diaRelativo, partesDelDia, sumarDias } from '@/lib/fechas';

/**
 * Fila de días deslizable: hoy y los siguientes. Cada día es un enlace (?fecha=), así que el
 * botón "atrás" del celular vuelve al día anterior y la vista se puede compartir.
 */
export function TiraDeDias({
  seleccionada,
  hoy,
  dias = 14,
  enlace,
}: {
  seleccionada: string;
  hoy: string;
  dias?: number;
  enlace: (fecha: string) => string;
}) {
  const fechas = Array.from({ length: dias }, (_, i) => sumarDias(hoy, i));
  return (
    <nav aria-label="Días" className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:px-0">
      <ul className="flex gap-2">
        {fechas.map((fecha) => {
          const activa = fecha === seleccionada;
          const { semana, dia } = partesDelDia(fecha);
          const relativo = diaRelativo(fecha, hoy);
          return (
            <li key={fecha}>
              <Link
                href={enlace(fecha)}
                aria-current={activa ? 'date' : undefined}
                aria-label={relativo ?? undefined}
                className={`flex min-h-14 w-14 flex-col items-center justify-center rounded-xl border text-sm transition-colors duration-150 ${
                  activa ? 'border-marca bg-marca text-white' : 'border-borde bg-superficie hover:bg-fondo'
                }`}
              >
                <span className={`text-xs capitalize ${activa ? 'text-white/90' : 'text-suave'}`}>{relativo === 'Hoy' ? 'hoy' : semana}</span>
                <span className="text-lg font-semibold leading-tight">{dia}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
