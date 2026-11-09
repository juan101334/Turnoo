import { History } from 'lucide-react';
import Link from 'next/link';
import { ESTADOS, nombresDeServicios, pesos, type Cita } from '@/lib/citas';
import { fechaDe, horaLocal, partesDelDia } from '@/lib/fechas';
import { InsigniaEstado } from './estado-cita';

/**
 * Las citas de un cliente, la más reciente primero, de 10 en 10 (?pagina=). Cada una abre su
 * detalle. Al barbero el backend le da solo las que tuvo con él.
 */
export function HistorialDeCitas({
  citas,
  zona,
  pagina,
  hayMas,
  enlace,
  conBarbero,
}: {
  citas: Cita[];
  zona: string;
  pagina: number;
  hayMas: boolean;
  enlace: (pagina: number) => string;
  conBarbero: boolean;
}) {
  return (
    <section aria-labelledby="historial" className="flex flex-col gap-3">
      <h2 id="historial" className="font-semibold">
        Historial de citas
      </h2>
      {citas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-borde bg-superficie px-6 py-8 text-center text-suave">
          <History aria-hidden className="size-7" />
          <p>{pagina === 0 ? 'Todavía no tiene citas.' : 'No hay más citas.'}</p>
        </div>
      ) : (
        <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie">
          {citas.map((c) => {
            const fecha = fechaDe(c.inicio, zona);
            const { semana, dia } = partesDelDia(fecha);
            const anio = fecha.slice(0, 4);
            const mes = new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' }).format(new Date(`${fecha}T12:00:00Z`)).replace('.', '');
            return (
              <li key={c.id}>
                <Link href={`/citas/${c.id}`} className={`flex min-h-16 items-center gap-3 border-l-4 px-3 py-2.5 transition-colors duration-150 hover:bg-fondo ${ESTADOS[c.estado].franja}`}>
                  <span className="flex w-12 shrink-0 flex-col items-center text-center leading-tight">
                    <span className="text-xs text-suave capitalize">{semana}</span>
                    <span className="cifras text-xl font-semibold">{dia}</span>
                    <span className="text-xs text-suave">
                      {mes} {anio}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold tabular-nums">{horaLocal(c.inicio, zona)}</span>
                      <InsigniaEstado estado={c.estado} />
                    </span>
                    <span className="block truncate text-sm text-suave">
                      {nombresDeServicios(c.servicios)}
                      {conBarbero && ` · ${c.profesionalNombre}`} · <span className="tabular-nums">{pesos(c.precioTotalCop)}</span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {(pagina > 0 || hayMas) && (
        <nav aria-label="Páginas del historial" className="grid grid-cols-2 gap-2">
          {pagina > 0 ? (
            <Link href={enlace(pagina - 1)} className="flex min-h-11 items-center justify-center rounded-lg border border-borde bg-superficie font-medium hover:bg-fondo">
              Más recientes
            </Link>
          ) : (
            <span />
          )}
          {hayMas && (
            <Link href={enlace(pagina + 1)} className="flex min-h-11 items-center justify-center rounded-lg border border-borde bg-superficie font-medium hover:bg-fondo">
              Más antiguas
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
