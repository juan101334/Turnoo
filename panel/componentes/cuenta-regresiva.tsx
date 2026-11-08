'use client';

import { Hourglass } from 'lucide-react';
import { useEffect, useState } from 'react';
import { minutosRestantes, tiempoRestante } from '@/lib/tiempo-restante';

/** Menos de esto se marca como urgente. */
const URGENTE_MINUTOS = 60;

/**
 * Cuánto queda para aprobar una cita; se actualiza sola cada 30 segundos. Arranca con la hora
 * del servidor (`ahora`) para que el HTML del servidor y el del navegador coincidan.
 */
export function CuentaRegresiva({ hasta, ahora }: { hasta: string; ahora: number }) {
  const [momento, setMomento] = useState(ahora);
  useEffect(() => {
    setMomento(Date.now());
    const reloj = setInterval(() => setMomento(Date.now()), 30_000);
    return () => clearInterval(reloj);
  }, []);

  const minutos = minutosRestantes(hasta, momento);
  const clases = minutos <= 0 ? 'bg-fondo text-suave' : minutos < URGENTE_MINUTOS ? 'bg-peligro-suave text-peligro' : 'bg-aviso-suave text-aviso';
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${clases}`}>
      <Hourglass aria-hidden className="size-3.5" />
      {minutos <= 0 ? 'Plazo vencido' : `Vence ${tiempoRestante(hasta, momento)}`}
    </span>
  );
}
