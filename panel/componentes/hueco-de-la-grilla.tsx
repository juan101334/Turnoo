'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import { marcaEn } from '@/lib/agenda';

export interface MarcaDelHueco {
  /** Minuto del día donde empieza la franja. */
  minuto: number;
  hora: string;
  /** Nueva cita con esta hora marcada. */
  href: string;
}

/**
 * Un hueco libre de la grilla: el mouse marca la franja del intervalo donde está ("+ 10:30") y
 * el clic agenda a esa hora. Con el teclado (o sin mover el mouse) vale el inicio del hueco.
 *
 * Sin prefetch: el enlace cambia con cada franja, y cada prefetch sería una petición al servidor.
 */
export function HuecoDeLaGrilla({
  marcas,
  etiqueta,
  pxPorMinuto,
  style,
}: {
  marcas: MarcaDelHueco[];
  etiqueta: string;
  pxPorMinuto: number;
  style: CSSProperties;
}) {
  const [i, setI] = useState(0);
  const inicio = marcas[0]!.minuto;
  const marca = marcas[i] ?? marcas[0]!;
  const siguiente = marcas[i + 1];

  return (
    <Link
      href={marca.href}
      prefetch={false}
      aria-label={etiqueta}
      onMouseMove={(e) => {
        const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
        setI(marcaEn(marcas.map((m) => m.minuto), inicio + y / pxPorMinuto));
      }}
      onMouseLeave={() => setI(0)}
      className="group absolute inset-x-1 overflow-hidden rounded-md text-xs font-semibold text-marca opacity-0 transition-opacity duration-150 hover:bg-marca-suave/60 hover:opacity-100 focus-visible:bg-marca-suave focus-visible:opacity-100"
      style={style}
    >
      <span
        aria-hidden
        data-hora={marca.hora}
        className="absolute inset-x-0 overflow-hidden rounded-md border border-marca bg-superficie px-2 py-0.5 whitespace-nowrap shadow-sm"
        style={{
          top: `${(marca.minuto - inicio) * pxPorMinuto}px`,
          // La franja llega hasta la marca siguiente (o el final del hueco), con un mínimo legible.
          minHeight: '1.375rem',
          height: siguiente ? `${(siguiente.minuto - marca.minuto) * pxPorMinuto}px` : undefined,
          bottom: siguiente ? undefined : 0,
        }}
      >
        + {marca.hora}
      </span>
    </Link>
  );
}
