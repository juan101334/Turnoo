import Link from 'next/link';
import { diaRelativo, diasDeLaTira, partesDelDia } from '@/lib/fechas';
import { FilaDeslizable } from './fila-deslizable';

/**
 * Fila de días deslizable: hoy y los siguientes. Cada día es un enlace (?fecha=), así que el
 * botón "atrás" del celular vuelve al día anterior y la vista se puede compartir. Con `semanas`,
 * en el PC lleva botones para pasar de semana (la rueda del mouse también la mueve).
 */
export function TiraDeDias({
  seleccionada,
  hoy,
  dias = 14,
  semanas = false,
  enlace,
  citasPorDia,
}: {
  seleccionada: string;
  hoy: string;
  dias?: number;
  semanas?: boolean;
  enlace: (fecha: string) => string;
  /** Citas de cada día ('AAAA-MM-DD'): los días con alguna llevan un punto. Sin él, no hay puntos. */
  citasPorDia?: Record<string, number> | undefined;
}) {
  return (
    <FilaDeslizable etiqueta="Días" semanas={semanas}>
      <ul className="flex gap-2">
        {diasDeLaTira(seleccionada, hoy, dias).map((fecha) => {
          const activa = fecha === seleccionada;
          const { semana, dia } = partesDelDia(fecha);
          const relativo = diaRelativo(fecha, hoy);
          const visible = `${relativo === 'Hoy' ? 'hoy' : semana} ${dia}`;
          const citas = citasPorDia?.[fecha] ?? 0;
          // El nombre que se oye empieza con lo que se ve ("lun 9"); agrega "mañana" y cuántas citas
          // hay, que el punto solo muestra con forma (no se lee).
          const extras = [relativo === 'Mañana' && 'mañana', citas > 0 && (citas === 1 ? '1 cita' : `${citas} citas`)].filter(Boolean);
          const etiqueta = extras.length > 0 ? `${visible}, ${extras.join(', ')}` : undefined;
          return (
            <li key={fecha} className="shrink-0">
              <Link
                href={enlace(fecha)}
                aria-current={activa ? 'date' : undefined}
                aria-label={etiqueta}
                className={`flex min-h-14 w-14 flex-col items-center justify-center rounded-xl border text-sm transition-colors duration-150 ${
                  activa ? 'border-marca bg-marca text-white' : 'border-borde bg-superficie hover:bg-fondo'
                }`}
              >
                <span className={`text-xs capitalize ${activa ? 'text-white/90' : 'text-suave'}`}>{relativo === 'Hoy' ? 'hoy' : semana}</span>{' '}
                <span className="text-lg font-semibold leading-tight">{dia}</span>
                {citasPorDia && (
                  // Siempre ocupa su lugar: con o sin punto, todos los días miden lo mismo.
                  <span aria-hidden className={`mt-0.5 size-1.5 rounded-full ${citas === 0 ? 'invisible' : activa ? 'bg-white' : 'bg-marca'}`} />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </FilaDeslizable>
  );
}
