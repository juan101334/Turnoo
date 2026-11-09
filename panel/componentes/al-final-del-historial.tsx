'use client';

import { useEffect, useRef } from 'react';

/**
 * Abre la conversación en el último mensaje, como cualquier chat. Si llega uno nuevo (el refresco
 * cada 20 s) y la persona estaba abajo, la sigue; si estaba leyendo arriba, no la mueve.
 * En el escritorio se desplaza el historial; en el celular, la página.
 */
export function AlFinalDelHistorial({ id, cantidad }: { id: string; cantidad: number }) {
  const anterior = useRef<number | null>(null);
  useEffect(() => {
    const historial = document.getElementById(id);
    if (!historial) return;
    const propio = historial.scrollHeight > historial.clientHeight + 1;
    const primera = anterior.current === null;
    anterior.current = cantidad;
    if (propio) {
      const cerca = historial.scrollHeight - historial.scrollTop - historial.clientHeight < 160;
      if (primera || cerca) historial.scrollTop = historial.scrollHeight;
      return;
    }
    const pagina = document.scrollingElement ?? document.documentElement;
    const cerca = pagina.scrollHeight - window.scrollY - window.innerHeight < 160;
    if (primera || cerca) window.scrollTo({ top: pagina.scrollHeight });
  }, [id, cantidad]);
  return null;
}
