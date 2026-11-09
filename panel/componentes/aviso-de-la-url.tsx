'use client';

import { useEffect, useRef } from 'react';
import { useAvisar } from './avisos-flotantes';

/**
 * Las acciones que terminan en otra página (crear, editar) dejan ?listo=… en la URL. Aquí se
 * convierte en un aviso breve y se quita de la barra de direcciones, para que al recargar o volver
 * atrás no aparezca otra vez.
 */
export function AvisoDeLaUrl({ mensaje }: { mensaje: string | undefined }) {
  const avisar = useAvisar();
  const mostrado = useRef(false);
  useEffect(() => {
    if (!mensaje || mostrado.current) return;
    mostrado.current = true;
    avisar(mensaje);
    const url = new URL(window.location.href);
    url.searchParams.delete('listo');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }, [mensaje, avisar]);
  return null;
}
