'use client';

import { useState, type ReactNode } from 'react';
import type { EstadoAccion } from '@/app/(panel)/citas/acciones';
import type { HoraLibre } from '@/lib/agenda';
import { Aviso } from './aviso';
import { BotonEnviar, Formulario } from './formulario';
import { HorasLibres } from './horas-libres';

/**
 * Elegir una hora y confirmar (Nueva cita, Reprogramar). Abajo va una barra fija con el resumen
 * y el botón: con muchas horas, el botón no se pierde al final de la página y se ve qué se va a
 * guardar antes de tocarlo. `children` va entre las horas y la barra (datos del cliente, notas).
 */
export function FormularioDeHora({
  accion,
  horas,
  elegida,
  resumen,
  boton,
  enviando,
  children,
}: {
  accion: (previo: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;
  horas: HoraLibre[];
  elegida?: string | undefined;
  /** 'Juan Pérez · Corte y Barba · 50 min · $40.000'. */
  resumen: string;
  boton: string;
  enviando: string;
  children?: ReactNode;
}) {
  const [hora, setHora] = useState(() => horas.find((h) => h.inicio === elegida)?.etiqueta);
  return (
    <Formulario<EstadoAccion> accion={accion} inicial={{}} className="flex flex-col gap-4">
      {(estado) => (
        <>
          <div
            onChange={(evento) => {
              const radio = evento.target as HTMLInputElement;
              if (radio.name === 'inicio') setHora(radio.dataset.etiqueta);
            }}
          >
            <HorasLibres horas={horas} elegida={elegida} />
          </div>
          {children}
          {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
          <div className="sticky bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-col gap-2 border-t border-borde bg-superficie/95 px-4 py-3 shadow-flotante backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:rounded-xl sm:border md:bottom-4">
            <p aria-live="polite" className="min-w-0 flex-1 text-sm">
              <span className="font-semibold tabular-nums">{hora ?? 'Elige la hora'}</span>
              <span className="text-suave"> · {resumen}</span>
            </p>
            <div className="sm:w-48">
              <BotonEnviar enviando={enviando}>{boton}</BotonEnviar>
            </div>
          </div>
        </>
      )}
    </Formulario>
  );
}
