'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { textoDelContador } from '@/lib/navegacion';

const PREFIJO = /^\(\d+\+?\) /;

/**
 * Pone delante del título de la pestaña cuántos clientes esperan respuesta: "(3) Mensajes · Turnoo".
 * Así el dueño lo ve aunque la pestaña esté de fondo. Next cambia el título al navegar, por eso se
 * vigila el <head> y se vuelve a poner; sin pendientes, el título queda como lo dejó Next.
 */
export function TituloConPendientes({ n }: { n: number | undefined }) {
  const ruta = usePathname();
  useEffect(() => {
    const texto = textoDelContador(n);
    const aplicar = () => {
      const deseado = (texto ? `(${texto}) ` : '') + document.title.replace(PREFIJO, '');
      if (document.title !== deseado) document.title = deseado;
    };
    aplicar();
    const observador = new MutationObserver(aplicar);
    observador.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      observador.disconnect();
      document.title = document.title.replace(PREFIJO, '');
    };
  }, [n, ruta]);
  return null;
}
