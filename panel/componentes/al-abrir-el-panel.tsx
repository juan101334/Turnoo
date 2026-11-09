'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Al abrir el panel lateral: lleva el foco a su título y deja cerrarlo con Escape. */
export function AlAbrirElPanel({ cerrar, enfocar, clave }: { cerrar: string; enfocar: string; clave: string }) {
  const router = useRouter();
  useEffect(() => {
    document.getElementById(enfocar)?.focus({ preventScroll: true });
  }, [enfocar, clave]);
  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape' && !evento.defaultPrevented) router.push(cerrar, { scroll: false });
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [cerrar, router]);
  return null;
}
