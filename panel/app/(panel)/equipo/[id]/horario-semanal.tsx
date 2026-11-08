'use client';

import { Trash2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Aviso } from '@/componentes/aviso';
import { horaLegible, type Horario } from '@/lib/administracion';
import { quitarHorario, type ResultadoQuitarHorario } from '../acciones';

/**
 * Los siete días con sus rangos. Al quitar uno, el aviso queda en la sección (no en la fila, que
 * desaparece) con las citas que quedaron fuera del horario: siguen agendadas y el dueño decide.
 */
export function HorarioSemanal({ barberoId, dias }: { barberoId: string; dias: { dia: number; nombre: string; rangos: Horario[] }[] }) {
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<(ResultadoQuitarHorario & { quitado: boolean }) | null>(null);
  const [pendiente, iniciar] = useTransition();

  const quitar = (horarioId: string) =>
    iniciar(async () => {
      const r = await quitarHorario(barberoId, horarioId);
      setResultado({ ...r, quitado: !r.error });
      setConfirmando(null);
    });

  return (
    <div className="flex flex-col gap-3">
      {resultado?.error && <Aviso tipo="error">{resultado.error}</Aviso>}
      {resultado?.quitado && (resultado.afectadas?.length ?? 0) === 0 && <Aviso tipo="exito">Horario quitado.</Aviso>}
      {resultado?.quitado && resultado.afectadas && resultado.afectadas.length > 0 && (
        <div role="status" className="rounded-lg bg-aviso-suave p-3 text-sm text-aviso">
          <p className="flex items-center gap-1.5 font-semibold">
            <TriangleAlert aria-hidden className="size-4" />
            Horario quitado. Estas citas quedaron fuera del horario y siguen agendadas:
          </p>
          <ul className="mt-1">
            {resultado.afectadas.map((c) => (
              <li key={c.id}>
                <Link href={`/citas/${c.id}`} className="underline underline-offset-2 first-letter:uppercase">
                  {c.texto}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="divide-y divide-borde rounded-xl border border-borde">
        {dias.map(({ dia, nombre, rangos }) => (
          <li key={dia} className="flex items-start gap-3 px-3 py-2">
            <span className="w-24 shrink-0 pt-2.5 text-sm font-medium">{nombre}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {rangos.length === 0 && <span className="pt-2.5 text-sm text-suave">No atiende</span>}
              {rangos.map((r) =>
                confirmando === r.id ? (
                  <div key={r.id} className="flex flex-col gap-2 rounded-lg bg-peligro-suave p-2">
                    <p className="text-sm">
                      ¿Quitar {horaLegible(r.horaInicio)} a {horaLegible(r.horaFin)}? Las citas ya agendadas a esa hora no se cancelan.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setConfirmando(null)} className="min-h-11 cursor-pointer rounded-lg border border-borde bg-superficie text-sm font-semibold">
                        Volver
                      </button>
                      <button
                        type="button"
                        disabled={pendiente}
                        onClick={() => quitar(r.id)}
                        className="min-h-11 cursor-pointer rounded-lg bg-peligro text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
                      >
                        {pendiente ? 'Quitando…' : 'Sí, quitar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={r.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm tabular-nums">
                      {horaLegible(r.horaInicio)} a {horaLegible(r.horaFin)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setResultado(null);
                        setConfirmando(r.id);
                      }}
                      aria-label={`Quitar ${nombre} de ${horaLegible(r.horaInicio)} a ${horaLegible(r.horaFin)}`}
                      className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg text-peligro hover:bg-peligro-suave"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </div>
                ),
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
