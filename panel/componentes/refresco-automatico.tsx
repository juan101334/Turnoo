'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Vuelve a pedir los datos de la pantalla cada `segundos` mientras la pestaña está a la vista, y
 * en cuanto vuelve a estarlo (el barbero desbloquea el celular). Así Hoy, Por aprobar y Mensajes
 * no se quedan viejos. router.refresh() conserva lo que la persona esté escribiendo.
 */
export function RefrescoAutomatico({ segundos = 60 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refrescar = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const reloj = setInterval(refrescar, segundos * 1000);
    document.addEventListener('visibilitychange', refrescar);
    return () => {
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', refrescar);
    };
  }, [router, segundos]);
  return null;
}
