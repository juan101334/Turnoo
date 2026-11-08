'use client';

import { Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Aviso } from '@/componentes/aviso';
import { quitarBloqueo } from './acciones';

/** Quitar un bloqueo pide confirmación: la agenda vuelve a quedar abierta a esa hora. */
export function QuitarBloqueo({ bloqueoId }: { bloqueoId: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string>();
  const [pendiente, iniciar] = useTransition();

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-peligro hover:bg-peligro-suave"
      >
        <Trash2 aria-hidden className="size-4" />
        Quitar
      </button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2">
      {error && <Aviso tipo="error">{error}</Aviso>}
      <p className="text-sm">¿Quitar este bloqueo? Esas horas vuelven a quedar libres para agendar.</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="min-h-11 cursor-pointer rounded-lg border border-borde bg-superficie font-semibold hover:bg-fondo"
        >
          Volver
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              const r = await quitarBloqueo(bloqueoId);
              if (r.error) setError(r.error);
            })
          }
          className="min-h-11 cursor-pointer rounded-lg bg-peligro font-semibold text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
        >
          {pendiente ? 'Quitando…' : 'Sí, quitar'}
        </button>
      </div>
    </div>
  );
}
