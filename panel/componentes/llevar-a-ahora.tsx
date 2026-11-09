'use client';

import { useEffect } from 'react';

/**
 * Al abrir la agenda de hoy en el escritorio, desplaza la grilla para que la línea de "ahora"
 * quede a un tercio de alto: lo que importa es lo que viene, no las 8 de la mañana.
 */
export function LlevarAAhora({ contenedor, linea }: { contenedor: string; linea: string }) {
  useEffect(() => {
    const caja = document.getElementById(contenedor);
    const marca = document.getElementById(linea);
    if (!caja || !marca) return;
    const distancia = marca.getBoundingClientRect().top - caja.getBoundingClientRect().top + caja.scrollTop;
    caja.scrollTop = Math.max(0, distancia - caja.clientHeight / 3);
  }, [contenedor, linea]);
  return null;
}
