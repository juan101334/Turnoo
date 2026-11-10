'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { mascaraDeBordes, pasoDeSemana } from '@/lib/fila-deslizable';

/**
 * Fila que se desliza de lado (tira de días, filtro de barberos). Lo que tiene:
 * - un degradado en el borde que todavía tiene más, como pista de que se desliza;
 * - la rueda del mouse la mueve de lado (en el PC no hay dedo para arrastrar);
 * - con `semanas`, botones "Semana anterior" y "Semana siguiente" desde 1024 px;
 * - al cargar, lo elegido (`aria-current`) queda a la vista, con uno antes para dar contexto.
 * Los enlaces los pinta el servidor: este componente solo mueve la fila.
 */
export function FilaDeslizable({ etiqueta, semanas = false, children }: { etiqueta: string; semanas?: boolean; children: ReactNode }) {
  const fila = useRef<HTMLDivElement>(null);
  // Adónde va la fila: con clics seguidos, el siguiente parte de ahí y no de donde va la animación.
  const destino = useRef<number | null>(null);
  const [bordes, setBordes] = useState({ antes: false, despues: false });

  const medir = useCallback(() => {
    const caja = fila.current;
    if (!caja) return;
    // 1 px de tolerancia: el zoom del navegador deja fracciones.
    setBordes({ antes: caja.scrollLeft > 1, despues: caja.scrollLeft + caja.clientWidth < caja.scrollWidth - 1 });
  }, []);

  useEffect(() => {
    const caja = fila.current;
    if (!caja) return;
    const elegido = caja.querySelector<HTMLElement>('[aria-current]');
    if (elegido) {
      const visible = caja.getBoundingClientRect();
      const propio = elegido.getBoundingClientRect();
      // Solo si no se ve entero: si ya está a la vista, la fila no se mueve.
      if (propio.left < visible.left || propio.right > visible.right) {
        const anterior = elegido.closest('li')?.previousElementSibling ?? elegido;
        caja.scrollLeft += anterior.getBoundingClientRect().left - visible.left - Number.parseFloat(getComputedStyle(caja).paddingLeft);
      }
    }
    medir();
    const alCambiarDeTamano = new ResizeObserver(medir);
    alCambiarDeTamano.observe(caja);
    // La rueda vertical mueve la fila de lado, solo si todavía puede moverse hacia ahí; si no, la
    // página sigue bajando como siempre. Sin `passive: false` no se puede frenar el desplazamiento.
    const rueda = (evento: WheelEvent) => {
      if (Math.abs(evento.deltaY) <= Math.abs(evento.deltaX) || evento.ctrlKey) return;
      const max = caja.scrollWidth - caja.clientWidth;
      const puede = evento.deltaY > 0 ? caja.scrollLeft < max - 1 : caja.scrollLeft > 1;
      if (!puede) return;
      evento.preventDefault();
      caja.scrollLeft += evento.deltaY;
    };
    caja.addEventListener('wheel', rueda, { passive: false });
    return () => {
      alCambiarDeTamano.disconnect();
      caja.removeEventListener('wheel', rueda);
    };
  }, [medir]);

  const mover = (sentido: 1 | -1) => {
    const caja = fila.current;
    if (!caja) return;
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const [primero, segundo] = caja.querySelectorAll('li');
    const paso = primero && segundo ? segundo.getBoundingClientRect().left - primero.getBoundingClientRect().left : caja.clientWidth;
    const enCamino = destino.current !== null && Math.abs(destino.current - caja.scrollLeft) > 1;
    const desde = enCamino ? destino.current! : caja.scrollLeft;
    const hasta = Math.min(Math.max(desde + sentido * pasoDeSemana(paso, caja.clientWidth), 0), caja.scrollWidth - caja.clientWidth);
    destino.current = hasta;
    caja.scrollTo({ left: hasta, behavior: reducido ? 'auto' : 'smooth' });
  };

  const boton = 'hidden size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-borde bg-superficie transition-colors duration-150 hover:bg-fondo disabled:cursor-default disabled:opacity-40 disabled:hover:bg-superficie lg:flex';
  return (
    <nav aria-label={etiqueta} className="flex items-center gap-2">
      {semanas && (
        <button type="button" aria-label="Semana anterior" disabled={!bordes.antes} onClick={() => mover(-1)} className={boton}>
          <ChevronLeft aria-hidden className="size-5" />
        </button>
      )}
      <div
        ref={fila}
        onScroll={medir}
        className="-mx-4 min-w-0 flex-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: mascaraDeBordes(bordes), WebkitMaskImage: mascaraDeBordes(bordes) }}
      >
        {children}
      </div>
      {semanas && (
        <button type="button" aria-label="Semana siguiente" disabled={!bordes.despues} onClick={() => mover(1)} className={boton}>
          <ChevronRight aria-hidden className="size-5" />
        </button>
      )}
    </nav>
  );
}
