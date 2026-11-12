'use client';

import { CheckCheck, CircleAlert } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { completarCitas } from '@/app/(panel)/citas/acciones';
import { useAccionDiferida } from './accion-diferida';
import { useAvisar } from './avisos-flotantes';
import { DialogoConfirmar } from './dialogo-confirmar';

export interface CitaPasada {
  id: string;
  hora: string;
  cliente: string;
  /** Solo si el dueño ve a todo el equipo. */
  barbero?: string | undefined;
}

const nombre = (c: CitaPasada) => `${c.hora} · ${c.cliente}${c.barbero ? ` · ${c.barbero}` : ''}`;
const citas = (n: number) => (n === 1 ? '1 cita' : `${n} citas`);

/**
 * En Hoy: las citas que ya terminaron y nadie marcó, todas de una vez. Pide confirmación con la
 * lista de lo que va a marcar (en lugar de "Deshacer": son varias y el backend no deja volver a
 * pendiente). Si alguna falla, dice cuáles y por qué, y "Reintentar" manda solo esas.
 *
 * Con una sola no aparece: para eso está "Completada" en su tarjeta.
 */
export function CompletarPasadas({ citas: todas }: { citas: CitaPasada[] }) {
  const { hechas } = useAccionDiferida();
  const avisar = useAvisar();
  const [preguntando, setPreguntando] = useState(false);
  const [enviando, iniciar] = useTransition();
  const [fallidas, setFallidas] = useState<{ cita: CitaPasada; error: string }[]>([]);
  // Lo que se mandó, para nombrar las que fallen aunque la pantalla ya se haya refrescado.
  const enviadas = useRef(new Map<string, CitaPasada>());

  // Las marcadas a mano en esta pantalla (aún en su tiempo de "Deshacer") no se mandan otra vez.
  const pendientes = todas.filter((c) => !hechas.has(c.id));

  function marcar(lote: CitaPasada[]) {
    enviadas.current = new Map(lote.map((c) => [c.id, c]));
    iniciar(async () => {
      try {
        const { fallidas: malas } = await completarCitas(lote.map((c) => c.id));
        const conNombre = malas.flatMap((f) => {
          const cita = enviadas.current.get(f.id);
          return cita ? [{ cita, error: f.error }] : [];
        });
        setFallidas(conNombre);
        const bien = lote.length - conNombre.length;
        if (bien > 0) avisar(bien === 1 ? '1 cita marcada como completada.' : `${bien} citas marcadas como completadas.`);
      } catch {
        setFallidas(lote.map((cita) => ({ cita, error: 'No se pudo guardar. Revisa la conexión.' })));
      }
    });
  }

  if (fallidas.length === 0 && pendientes.length < 2) return null;

  return (
    <div className="mb-4 flex flex-col gap-3">
      {pendientes.length >= 2 && fallidas.length === 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-borde bg-superficie px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <span className="font-semibold">{citas(pendientes.length)}</span> ya terminaron y siguen sin marcar.
          </p>
          <button
            type="button"
            disabled={enviando}
            onClick={() => setPreguntando(true)}
            className="flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-marca px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-marca-oscura disabled:cursor-wait disabled:opacity-70"
          >
            <CheckCheck aria-hidden className="size-4" />
            {enviando ? 'Marcando…' : `Marcar las ${pendientes.length} como completadas`}
          </button>
        </div>
      )}

      {fallidas.length > 0 && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-peligro-suave px-4 py-3 text-sm text-peligro">
          <p className="flex items-center gap-2 font-semibold">
            <CircleAlert aria-hidden className="size-4 shrink-0" />
            {fallidas.length === 1 ? 'No se pudo marcar 1 cita:' : `No se pudieron marcar ${fallidas.length} citas:`}
          </p>
          <ul className="flex flex-col gap-1 pl-6">
            {fallidas.map((f) => (
              <li key={f.cita.id}>
                <span className="font-medium">{nombre(f.cita)}</span> — {f.error}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={enviando}
              onClick={() => marcar(fallidas.map((f) => f.cita))}
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
        titulo={`¿Marcar ${citas(pendientes.length)} como completadas?`}
        confirmar="Marcar como completadas"
        alCancelar={() => setPreguntando(false)}
        alConfirmar={() => {
          setPreguntando(false);
          marcar(pendientes);
        }}
      >
        <ul aria-label="Citas que se marcan" className="flex max-h-60 flex-col gap-1 overflow-y-auto text-texto">
          {pendientes.map((c) => (
            <li key={c.id} className="tabular-nums">
              {nombre(c)}
            </li>
          ))}
        </ul>
        <p>Si alguien no vino, cámbiala después a &quot;No asistió&quot; en su detalle.</p>
      </DialogoConfirmar>
    </div>
  );
}
