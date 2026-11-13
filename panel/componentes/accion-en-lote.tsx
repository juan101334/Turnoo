'use client';

import { CircleAlert, type LucideIcon } from 'lucide-react';
import { useRef, useState, useTransition, type ReactNode } from 'react';
import { useAccionDiferida } from './accion-diferida';
import { useAvisar } from './avisos-flotantes';
import { DialogoConfirmar } from './dialogo-confirmar';

export interface ElementoDelLote {
  id: string;
  /** Cómo se nombra en la confirmación y en los errores: "10:00 · Ana". */
  nombre: string;
  /** Lo que va al lado del nombre en la confirmación (por ejemplo, el historial del cliente). */
  detalle?: ReactNode;
}

export interface TextosDelLote {
  /** Frase de la franja: "<b>3 citas</b> ya terminaron y siguen sin marcar." */
  franja: (cantidad: string) => ReactNode;
  boton: (n: number) => string;
  enviando: string;
  titulo: (cantidad: string) => string;
  confirmar: string;
  /** Aviso flotante con las que salieron bien. */
  hechas: (n: number) => string;
  /** "No se pudo marcar 1 cita:" / "No se pudieron marcar 3 citas:". */
  fallidas: (n: number) => string;
  /** Nombre accesible de la lista de la confirmación. */
  lista: string;
}

const citas = (n: number) => (n === 1 ? '1 cita' : `${n} citas`);

/**
 * Una acción sobre varias citas de una vez (completar las pasadas, aprobar todas). Pide
 * confirmación con la lista de lo que va a hacer, en lugar de "Deshacer": son varias y el backend
 * no deja volver atrás. Si alguna falla, dice cuáles y por qué, y "Reintentar" manda solo esas.
 *
 * Las que se hicieron a mano en esta pantalla (aún en su tiempo de "Deshacer") no se mandan otra
 * vez. Con menos de dos no aparece: para una sola está el botón de su tarjeta.
 */
export function AccionEnLote({
  elementos,
  accion,
  textos,
  icono: Icono,
  nota,
}: {
  elementos: ElementoDelLote[];
  accion: (ids: string[]) => Promise<{ fallidas: { id: string; error: string }[] }>;
  textos: TextosDelLote;
  icono: LucideIcon;
  /** Lo que conviene saber antes de confirmar, debajo de la lista. */
  nota?: ReactNode;
}) {
  const { hechas } = useAccionDiferida();
  const avisar = useAvisar();
  const [preguntando, setPreguntando] = useState(false);
  const [enviando, iniciar] = useTransition();
  const [fallidas, setFallidas] = useState<{ elemento: ElementoDelLote; error: string }[]>([]);
  // Lo que se mandó, para nombrar las que fallen aunque la pantalla ya se haya refrescado.
  const enviados = useRef(new Map<string, ElementoDelLote>());

  const pendientes = elementos.filter((e) => !hechas.has(e.id));

  function hacer(lote: ElementoDelLote[]) {
    enviados.current = new Map(lote.map((e) => [e.id, e]));
    iniciar(async () => {
      try {
        const { fallidas: malas } = await accion(lote.map((e) => e.id));
        const conNombre = malas.flatMap((f) => {
          const elemento = enviados.current.get(f.id);
          return elemento ? [{ elemento, error: f.error }] : [];
        });
        setFallidas(conNombre);
        const bien = lote.length - conNombre.length;
        if (bien > 0) avisar(textos.hechas(bien));
      } catch {
        setFallidas(lote.map((elemento) => ({ elemento, error: 'No se pudo guardar. Revisa la conexión.' })));
      }
    });
  }

  if (fallidas.length === 0 && pendientes.length < 2) return null;

  return (
    <div className="mb-4 flex flex-col gap-3">
      {pendientes.length >= 2 && fallidas.length === 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-borde bg-superficie px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">{textos.franja(citas(pendientes.length))}</p>
          <button
            type="button"
            disabled={enviando}
            onClick={() => setPreguntando(true)}
            className="flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-marca px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-marca-oscura disabled:cursor-wait disabled:opacity-70"
          >
            <Icono aria-hidden className="size-4" />
            {enviando ? textos.enviando : textos.boton(pendientes.length)}
          </button>
        </div>
      )}

      {fallidas.length > 0 && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-peligro-suave px-4 py-3 text-sm text-peligro">
          <p className="flex items-center gap-2 font-semibold">
            <CircleAlert aria-hidden className="size-4 shrink-0" />
            {textos.fallidas(fallidas.length)}
          </p>
          <ul className="flex flex-col gap-1 pl-6">
            {fallidas.map((f) => (
              <li key={f.elemento.id}>
                <span className="font-medium">{f.elemento.nombre}</span> — {f.error}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={enviando}
              onClick={() => hacer(fallidas.map((f) => f.elemento))}
              className="min-h-11 cursor-pointer rounded-lg bg-peligro px-4 font-semibold text-white transition-opacity duration-150 hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
            >
              {enviando ? 'Reintentando…' : fallidas.length === 1 ? 'Reintentar' : `Reintentar las ${fallidas.length}`}
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={() => setFallidas([])}
              className="min-h-11 cursor-pointer rounded-lg border border-peligro/40 px-4 font-semibold transition-colors duration-150 hover:bg-superficie"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <DialogoConfirmar
        abierto={preguntando}
        titulo={textos.titulo(citas(pendientes.length))}
        confirmar={textos.confirmar}
        alCancelar={() => setPreguntando(false)}
        alConfirmar={() => {
          setPreguntando(false);
          hacer(pendientes);
        }}
      >
        <ul aria-label={textos.lista} className="flex max-h-[45dvh] flex-col gap-1 overflow-y-auto text-texto">
          {pendientes.map((e) => (
            <li key={e.id} className="tabular-nums">
              {e.nombre}
              {e.detalle}
            </li>
          ))}
        </ul>
        {nota}
      </DialogoConfirmar>
    </div>
  );
}
