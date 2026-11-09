'use client';

import { useEffect, useState } from 'react';
import { minutosRestantes, tiempoRestante } from '@/lib/tiempo-restante';

/**
 * '· en 12 min', y se actualiza solo cada 30 s. Arranca con la hora del servidor (`ahora`) para
 * que el HTML del servidor y el del navegador coincidan.
 */
export function FaltaPara({ inicio, ahora }: { inicio: string; ahora: number }) {
  const [momento, setMomento] = useState(ahora);
  useEffect(() => {
    setMomento(Date.now());
    const reloj = setInterval(() => setMomento(Date.now()), 30_000);
    return () => clearInterval(reloj);
  }, []);
  return <>· {minutosRestantes(inicio, momento) <= 0 ? 'ya es la hora' : tiempoRestante(inicio, momento)}</>;
}
