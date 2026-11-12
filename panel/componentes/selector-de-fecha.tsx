'use client';

import { CalendarDays, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';

/**
 * La fecha del encabezado es el botón para cambiar de día: al elegir, la agenda cambia (sin
 * "Ver"). Va a la izquierda, bajo el título, para no quitarle espacio a la tira de días y para que
 * el calendario del sistema abra con lugar debajo, sin cortarse.
 */
export function SelectorDeFecha({ fecha, texto, enlace }: { fecha: string; texto: string; enlace: string }) {
  const router = useRouter();
  return (
    <label className="relative -ml-2 inline-flex min-h-11 max-w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm text-suave transition-colors duration-150 focus-within:outline-2 focus-within:outline-marca hover:bg-hundido hover:text-texto">
      <CalendarDays aria-hidden className="size-4 shrink-0 text-marca" />
      {/* Mayúscula escrita, no con ::first-letter: Chrome mide el ancho con la minúscula y el texto se parte. */}
      <span className="whitespace-nowrap">{texto.charAt(0).toUpperCase() + texto.slice(1)}</span>
      <ChevronDown aria-hidden className="size-4 shrink-0" />
      <input
        type="date"
        aria-label={`Ir a otra fecha (ahora: ${texto})`}
        defaultValue={fecha}
        // 16 px aunque no se vea: con menos, Safari del iPhone acerca la página al tocarlo.
        className="absolute inset-0 cursor-pointer text-base opacity-0"
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
