import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { nombresDeServicios, type Cita } from '@/lib/citas';
import { horaLocal } from '@/lib/fechas';
import { InsigniaEstado } from './estado-cita';

/**
 * Citas de un día en orden de hora. La hora va grande a la izquierda: es lo primero que busca
 * el barbero. En el día de hoy, una línea marca dónde va "ahora".
 */
export function ListaDeCitas({
  citas,
  zona,
  mostrarBarbero,
  ahora,
  vacia,
}: {
  citas: Cita[];
  zona: string;
  mostrarBarbero: boolean;
  /** Solo en el día de hoy: dibuja la línea de "ahora". */
  ahora?: Date;
  vacia: ReactNode;
}) {
  if (citas.length === 0) {
    return <div className="rounded-2xl border border-dashed border-borde bg-superficie px-6 py-10 text-center text-suave">{vacia}</div>;
  }
  const ordenadas = [...citas].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
  const posicionAhora = ahora ? ordenadas.findIndex((c) => Date.parse(c.inicio) > ahora.getTime()) : -2;

  const filas: ReactNode[] = ordenadas.map((cita) => (
    <li key={cita.id}>
      <Link
        href={`/citas/${cita.id}`}
        className={`flex min-h-16 items-center gap-3 rounded-2xl border border-borde bg-superficie p-3 transition-colors duration-150 hover:bg-fondo ${
          cita.estado === 'cancelada' ? 'opacity-60' : ''
        }`}
      >
        <span className="w-[6.5rem] shrink-0 self-start pt-0.5 text-base font-semibold whitespace-nowrap tabular-nums">{horaLocal(cita.inicio, zona)}</span>
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="block max-w-full truncate font-medium">{cita.clienteNombre ?? 'Cliente sin nombre'}</span>
          <span className="block max-w-full truncate text-sm text-suave">
            {nombresDeServicios(cita.servicios)}
            {mostrarBarbero && ` · ${cita.profesionalNombre}`}
          </span>
          <InsigniaEstado estado={cita.estado} />
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-suave" />
      </Link>
    </li>
  ));

  if (ahora) {
    const linea = (
      <li key="ahora" aria-label={`Ahora, ${horaLocal(ahora, zona)}`} className="flex items-center gap-2 text-xs font-semibold text-marca">
        <span className="size-2 rounded-full bg-marca" />
        Ahora · {horaLocal(ahora, zona)}
        <span className="h-px flex-1 bg-marca" />
      </li>
    );
    filas.splice(posicionAhora === -1 ? filas.length : posicionAhora, 0, linea);
  }
  return <ul className="flex flex-col gap-2">{filas}</ul>;
}
