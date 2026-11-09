'use client';

import { CalendarClock, Check, UserX, X } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useEffect, useState, type ReactNode } from 'react';
import { Aviso } from '@/componentes/aviso';
import { useAvisar } from '@/componentes/avisos-flotantes';
import { BotonEnviar } from '@/componentes/formulario';
import type { Accion } from '@/lib/citas';
import { accionSobreCita, type EstadoAccion } from '@/app/(panel)/citas/acciones';

const BOTONES: Record<Exclude<Accion, 'reprogramar'>, { etiqueta: string; Icono: typeof Check; variante: 'primario' | 'secundario' | 'peligro' }> = {
  completar: { etiqueta: 'Completada', Icono: Check, variante: 'primario' },
  aprobar: { etiqueta: 'Aprobar', Icono: Check, variante: 'primario' },
  noAsistio: { etiqueta: 'No asistió', Icono: UserX, variante: 'secundario' },
  rechazar: { etiqueta: 'Rechazar', Icono: X, variante: 'secundario' },
  cancelar: { etiqueta: 'Cancelar cita', Icono: X, variante: 'secundario' },
};

/** Lo que se confirma antes de hacerlo: no se deshace con un toque. */
const CONFIRMAR: Partial<Record<Accion, { pregunta: string; boton: string; detalle?: string }>> = {
  cancelar: {
    pregunta: '¿Cancelar esta cita?',
    boton: 'Sí, cancelar',
    detalle: 'El cliente no recibe un aviso automático: escríbele tú si hace falta.',
  },
  rechazar: { pregunta: '¿Rechazar esta cita?', boton: 'Sí, rechazar', detalle: 'El horario queda libre otra vez.' },
  noAsistio: { pregunta: '¿Marcar que el cliente no asistió?', boton: 'Sí, no asistió' },
};

const ESTILOS = {
  primario: 'bg-marca text-white hover:bg-marca-oscura',
  secundario: 'border border-borde bg-superficie hover:bg-fondo',
  peligro: 'bg-peligro text-white hover:opacity-90',
} as const;

export function AccionesCita({ citaId, acciones, antes }: { citaId: string; acciones: Accion[]; /** Un botón propio de la pantalla, primero en la fila. */ antes?: ReactNode }) {
  const [estado, enviar] = useActionState<EstadoAccion, FormData>(accionSobreCita.bind(null, citaId), {});
  const [confirmando, setConfirmando] = useState<Accion | null>(null);
  const avisar = useAvisar();
  useEffect(() => {
    if (estado.listo) avisar(estado.listo);
  }, [estado, avisar]);

  if (acciones.length === 0 && !antes) {
    return null;
  }

  const pregunta = confirmando ? CONFIRMAR[confirmando] : undefined;
  return (
    <div className="flex flex-col gap-3">
      {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}

      {confirmando && pregunta ? (
        <form
          action={(datos) => {
            setConfirmando(null);
            enviar(datos);
          }}
          className="flex flex-col gap-3 rounded-xl border border-peligro bg-peligro-suave p-4"
        >
          <p className="font-semibold text-peligro">{pregunta.pregunta}</p>
          {pregunta.detalle && <p className="text-sm">{pregunta.detalle}</p>}
          <input type="hidden" name="accion" value={confirmando} />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfirmando(null)}
              className="min-h-11 cursor-pointer rounded-lg border border-borde bg-superficie font-semibold hover:bg-fondo"
            >
              Volver
            </button>
            <BotonEnviar enviando="Un momento…" variante="peligro">
              {pregunta.boton}
            </BotonEnviar>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {antes}
          {acciones.map((accion) => {
            if (accion === 'reprogramar') {
              return (
                <Link
                  key={accion}
                  href={`/citas/${citaId}/reprogramar`}
                  className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 font-semibold transition-colors duration-150 ${ESTILOS.secundario}`}
                >
                  <CalendarClock aria-hidden className="size-5" />
                  Reprogramar
                </Link>
              );
            }
            const { etiqueta, Icono, variante } = BOTONES[accion];
            const clases = `flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-3 font-semibold transition-colors duration-150 ${ESTILOS[variante]}`;
            if (CONFIRMAR[accion]) {
              return (
                <button key={accion} type="button" onClick={() => setConfirmando(accion)} className={clases}>
                  <Icono aria-hidden className="size-5" />
                  {etiqueta}
                </button>
              );
            }
            return (
              <form key={accion} action={enviar}>
                <input type="hidden" name="accion" value={accion} />
                <button type="submit" className={clases}>
                  <Icono aria-hidden className="size-5" />
                  {etiqueta}
                </button>
              </form>
            );
          })}
        </div>
      )}
    </div>
  );
}
