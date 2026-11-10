'use client';

import { Check, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { ESTADOS, type EstadoCita } from '@/lib/citas';
import { InsigniaEstado } from './estado-cita';
import { useAccionDiferida } from './accion-diferida';

/** Lo que muestra la tarjeta, ya en texto (las horas se calculan en el servidor, en la zona del negocio). */
export interface VistaDeCita {
  id: string;
  hora: string;
  cliente: string;
  /** 'Corte y Barba · Barbero Dos'. */
  detalle: string;
  /** 'hasta 11:20 a. m. · 50 min · $40.000'. */
  resumen: string;
  estado: EstadoCita;
  /** Ya empezó y no está marcada: lleva "Completada" en la misma tarjeta. */
  puedeCompletar: boolean;
}

/**
 * Una cita en la lista del día. La franja de la izquierda es el color del estado (siempre con su
 * insignia escrita: nunca solo color). Toda la tarjeta abre el detalle; "Completada" va aparte.
 */
export function TarjetaDeCita({ cita }: { cita: VistaDeCita }) {
  const { hechas, hacer: completar } = useAccionDiferida();
  const marcada = hechas.has(cita.id);
  const estado = marcada ? 'completada' : cita.estado;
  return (
    <li
      className={`flex items-stretch rounded-xl border border-l-4 border-borde bg-superficie transition-colors duration-200 ${ESTADOS[estado].franja} ${
        estado === 'cancelada' ? 'opacity-60' : ''
      }`}
    >
      <Link href={`/citas/${cita.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-l-lg py-3 pr-2 pl-3 transition-colors duration-150 hover:bg-fondo">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="cifras text-xl leading-tight font-semibold">{cita.hora}</span>
          <InsigniaEstado estado={estado} />
        </span>
        <span className="block font-medium break-words">{cita.cliente}</span>
        <span className="block text-sm text-suave break-words">{cita.detalle}</span>
        <span className="block text-sm text-suave tabular-nums">{cita.resumen}</span>
      </Link>
      {cita.puedeCompletar && !marcada ? (
        <div className="flex items-center pr-3">
          <button
            type="button"
            onClick={() => completar(cita.id, cita.cliente)}
            aria-label={`Completada, ${cita.cliente}`}
            className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg bg-marca px-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-marca-oscura"
          >
            <Check aria-hidden className="size-4" />
            Completada
          </button>
        </div>
      ) : (
        <span aria-hidden className="flex items-center pr-3 text-suave">
          <ChevronRight className="size-5" />
        </span>
      )}
    </li>
  );
}
