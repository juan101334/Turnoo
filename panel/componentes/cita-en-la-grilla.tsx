'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { ESTADOS, type EstadoCita } from '@/lib/citas';
import { useAccionDiferida } from './accion-diferida';
import { ICONOS_DE_ESTADO } from './estado-cita';

/** Alto de una línea del bloque (text-xs con interlineado de 14 px). */
const LINEA = 14;

export interface CitaDeLaGrilla {
  id: string;
  hora: string;
  cliente: string;
  servicios: string;
  estado: EstadoCita;
  href: string;
  /** Ya empezó y no está marcada: lleva "Completada", como la tarjeta del celular. */
  puedeCompletar: boolean;
}

/**
 * Una cita en la grilla del PC. El estado va con ícono y texto, nunca solo con el color de la
 * franja: ícono al lado de la hora (se ve aunque la cita sea corta) y el nombre del estado antes
 * de los servicios. "Completada" usa el mismo "Deshacer" que el celular (ProveedorDeMarcado).
 *
 * Con espacio (4 líneas o más) el botón dice "Completada" y se ve siempre. En una cita corta es
 * solo el ícono y aparece al pasar el mouse o al llegar con Tab: si ocupara su lugar fijo, le
 * quitaría ancho al nombre y lo cortaría en las columnas angostas.
 */
export function CitaEnLaGrilla({
  cita,
  elegida,
  arriba,
  alto,
  lineas,
}: {
  cita: CitaDeLaGrilla;
  elegida: boolean;
  arriba: string;
  /** En px: lo que dura, con un mínimo legible. */
  alto: number;
  /** Líneas de texto que caben en el bloque. */
  lineas: number;
}) {
  const { hechas, hacer: completar } = useAccionDiferida();
  const marcada = hechas.has(cita.id);
  const estado = marcada ? 'completada' : cita.estado;
  const { etiqueta, franja, texto } = ESTADOS[estado];
  const Icono = ICONOS_DE_ESTADO[estado];
  const conBoton = cita.puedeCompletar && !marcada;
  const botonConTexto = conBoton && lineas >= 4;
  // El botón con texto ocupa abajo casi dos líneas; el de solo ícono, la esquina de arriba.
  const lineasDeTexto = botonConTexto ? lineas - 2 : lineas;
  // En el mismo orden que el texto visible: quien usa control por voz dice lo que ve (WCAG 2.5.3).
  const nombre = `${cita.hora}, ${cita.cliente}, ${etiqueta}, ${cita.servicios}`;

  return (
    <div className="group/cita absolute inset-x-1 z-[1]" style={{ top: arriba, height: `${alto}px` }}>
      <Link
        href={cita.href}
        scroll={false}
        aria-label={nombre}
        aria-current={elegida ? 'true' : undefined}
        title={nombre}
        className={`block h-full overflow-hidden rounded-md border border-l-4 border-borde bg-superficie px-2 py-1 text-xs shadow-sm transition-shadow duration-150 hover:shadow-flotante ${franja} ${
          elegida ? 'ring-2 ring-marca' : ''
        }`}
      >
        {/* Alto justo de las líneas que caben: lo que sobra se corta entre líneas, sin "…" que haga parecer cortado el nombre. */}
        <span className="block overflow-hidden leading-3.5 break-words" style={{ maxHeight: `${Math.max(1, lineasDeTexto) * LINEA}px` }}>
          <Icono aria-hidden className={`mr-1 inline size-3 align-[-2px] ${texto}`} />
          <span className="cifras font-semibold">{cita.hora}</span> <span className="font-medium">{cita.cliente}</span>
          <br />
          <span className={`font-medium ${texto}`}>{etiqueta}</span>
          <span className="text-suave"> · {cita.servicios}</span>
        </span>
      </Link>
      {conBoton && (
        <button
          type="button"
          onClick={() => completar(cita.id, cita.cliente)}
          aria-label={`Completada, ${cita.cliente}`}
          title="Marcar como completada"
          className={`absolute z-[2] flex cursor-pointer items-center justify-center gap-1 rounded-md bg-marca text-white transition-colors duration-150 hover:bg-marca-oscura ${
            botonConTexto
              ? 'right-1.5 bottom-1.5 h-6 px-2 text-xs font-semibold'
              : 'top-1 right-1 size-6 opacity-0 shadow-sm group-hover/cita:opacity-100 focus-visible:opacity-100'
          }`}
        >
          <Check aria-hidden className="size-3.5" />
          {botonConTexto && 'Completada'}
        </button>
      )}
    </div>
  );
}
