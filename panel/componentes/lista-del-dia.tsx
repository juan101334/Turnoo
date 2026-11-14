import { CalendarPlus, Lock } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { TarjetaDeCita, type VistaDeCita } from './tarjeta-de-cita';

/** Lo que va en la lista del día, en orden de hora. */
export type ElementoDelDia =
  | { tipo: 'cita'; clave: string; cita: VistaDeCita }
  | { tipo: 'bloqueo'; clave: string; horas: string; motivo: string; quien?: string }
  | { tipo: 'hueco'; clave: string; horas: string; href: string }
  | { tipo: 'ahora'; clave: string; hora: string };

/**
 * El día en el celular y la tablet: citas, bloqueos y huecos libres en una sola columna, con la
 * línea de "ahora" en el día de hoy. Los huecos se pueden tocar para agendar ahí.
 */
export function ListaDelDia({ elementos, vacia }: { elementos: ElementoDelDia[]; vacia: ReactNode }) {
  if (!elementos.some((e) => e.tipo !== 'ahora')) {
    return <div className="rounded-xl border border-dashed border-borde bg-superficie px-6 py-10 text-center text-suave">{vacia}</div>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {elementos.map((e) => {
        switch (e.tipo) {
          case 'cita':
            return <TarjetaDeCita key={e.clave} cita={e.cita} />;
          case 'bloqueo':
            return (
              <li key={e.clave} className="flex items-center gap-3 rounded-xl bg-hundido px-3 py-2.5 text-sm text-suave">
                <Lock aria-hidden className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-texto tabular-nums">{e.horas}</span> · {e.motivo}
                  {e.quien && ` · ${e.quien}`}
                </span>
              </li>
            );
          case 'hueco':
            return (
              <li key={e.clave}>
                {/* Sin aria-label: el nombre es el texto que se ve ("Libre · 8:00 – 9:30, Agendar"), así quien
                    maneja el celular con la voz puede decir lo que lee (WCAG 2.5.3). */}
                <Link
                  href={e.href}
                  className="flex min-h-11 items-center gap-3 rounded-xl border border-dashed border-borde-fuerte px-3 py-2 text-sm transition-colors duration-150 hover:border-marca hover:bg-marca-suave"
                >
                  <span className="min-w-0 flex-1 text-suave">
                    Libre · <span className="tabular-nums">{e.horas}</span>
                    <span className="sr-only">,</span>
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-marca">
                    <CalendarPlus aria-hidden className="size-4" />
                    Agendar
                  </span>
                </Link>
              </li>
            );
          case 'ahora':
            return (
              <li key={e.clave} aria-label={`Ahora, ${e.hora}`} className="flex items-center gap-2 text-xs font-semibold text-marca">
                <span className="size-2 rounded-full bg-marca" />
                Ahora · {e.hora}
                <span className="h-px flex-1 bg-marca" />
              </li>
            );
        }
      })}
    </ul>
  );
}
