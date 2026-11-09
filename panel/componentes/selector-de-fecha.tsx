'use client';

import { CalendarDays } from 'lucide-react';
import { useRouter } from 'next/navigation';

/**
 * Un botón de calendario: al elegir un día, la agenda cambia a ese día (sin "Ver"). Es el
 * selector del sistema, que en el celular abre la rueda o el calendario nativo.
 */
export function SelectorDeFecha({ fecha, enlace }: { fecha: string; enlace: string }) {
  const router = useRouter();
  return (
    <label className="relative flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-borde bg-superficie px-3 text-sm font-medium hover:bg-fondo focus-within:outline-2 focus-within:outline-marca">
      <CalendarDays aria-hidden className="size-5 text-marca" />
      <span>Fecha</span>
      <input
        type="date"
        aria-label="Ir a otra fecha"
        defaultValue={fecha}
        className="absolute inset-0 cursor-pointer opacity-0"
        onClick={(evento) => {
          try {
            evento.currentTarget.showPicker();
          } catch {
            // Navegadores sin showPicker: el campo ya recibe el toque.
          }
        }}
        onChange={(evento) => {
          const elegida = evento.currentTarget.value;
          if (/^\d{4}-\d{2}-\d{2}$/.test(elegida)) router.push(enlace.replace('__FECHA__', elegida));
        }}
      />
    </label>
  );
}
