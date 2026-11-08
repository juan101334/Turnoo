'use client';

import { ShieldX } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Aviso } from '@/componentes/aviso';
import { anonimizarCliente } from '../acciones';

/**
 * Atiende el pedido de un cliente de borrar sus datos. Es irreversible, así que se explica qué
 * pasa y se confirma en un segundo paso.
 */
export function AnonimizarCliente({ clienteId }: { clienteId: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string>();
  const [pendiente, iniciar] = useTransition();

  return (
    <section aria-labelledby="borrar-datos" className="mt-6 rounded-2xl border border-borde bg-superficie p-4">
      <h2 id="borrar-datos" className="font-semibold">
        Borrar sus datos
      </h2>
      <p className="mb-3 text-sm text-suave">Si el cliente te pide que borres su información. Sus citas pasadas se conservan, sin nombre ni teléfono.</p>
      {error && (
        <div className="mb-3">
          <Aviso tipo="error">{error}</Aviso>
        </div>
      )}
      {!confirmando ? (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-peligro font-semibold text-peligro hover:bg-peligro-suave"
        >
          <ShieldX aria-hidden className="size-5" />
          Borrar datos del cliente
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-peligro bg-peligro-suave p-3">
          <p className="font-semibold text-peligro">¿Borrar los datos de este cliente?</p>
          <p className="text-sm">
            Se borran su nombre, su teléfono, las notas y las fotos que envió. <strong>No se puede deshacer.</strong> Si tiene citas activas, primero
            cancélalas o márcalas.
          </p>
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
                  const r = await anonimizarCliente(clienteId);
                  if (r?.error) {
                    setError(r.error);
                    setConfirmando(false);
                  }
                })
              }
              className="min-h-11 cursor-pointer rounded-lg bg-peligro font-semibold text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
            >
              {pendiente ? 'Borrando…' : 'Sí, borrar'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
