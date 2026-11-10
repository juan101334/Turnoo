'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { Aviso } from '@/componentes/aviso';
import { useAvisar } from '@/componentes/avisos-flotantes';
import type { ResultadoDeAccion } from '@/componentes/boton-de-accion';
import { escribioElNombre } from '@/lib/confirmacion';

/**
 * Suspender, en la zona de peligro: el botón abre una confirmación que pide escribir el nombre
 * del negocio. "Suspender" queda desactivado hasta que coincida exacto: así no se suspende el
 * negocio equivocado por un toque.
 */
export function SuspenderNegocio({ negocio, detalle, accion }: { negocio: string; detalle: string; accion: () => Promise<ResultadoDeAccion> }) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [escrito, setEscrito] = useState('');
  const [resultado, setResultado] = useState<ResultadoDeAccion>({});
  const [pendiente, iniciar] = useTransition();
  const campo = useRef<HTMLInputElement>(null);
  const abrir = useRef<HTMLButtonElement>(null);
  const avisar = useAvisar();
  const coincide = escribioElNombre(escrito, negocio);

  useEffect(() => {
    if (abierto) campo.current?.focus();
  }, [abierto]);

  const cerrar = () => {
    setAbierto(false);
    setEscrito('');
    // El foco vuelve al botón que abrió la confirmación (se monta en el siguiente render).
    requestAnimationFrame(() => abrir.current?.focus());
  };

  const suspender = () =>
    iniciar(async () => {
      const r = await accion();
      setResultado(r);
      if (r.listo) {
        avisar(r.listo);
        setAbierto(false);
        setEscrito('');
      }
    });

  return (
    <div className="flex flex-col gap-3">
      {resultado.error && <Aviso tipo="error">{resultado.error}</Aviso>}
      {abierto ? (
        <form
          className="flex flex-col gap-3 rounded-xl border border-peligro bg-peligro-suave p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (coincide && !pendiente) suspender();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !pendiente) cerrar();
          }}
        >
          <p className="font-semibold text-peligro">¿Suspender {negocio}?</p>
          <p className="text-sm">{detalle}</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-sm font-medium">
              Para confirmar, escribe <strong className="font-semibold break-words">{negocio}</strong>
            </label>
            <input
              ref={campo}
              id={id}
              value={escrito}
              onChange={(e) => setEscrito(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="min-h-11 w-full rounded-lg border border-borde bg-superficie px-3 text-base"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={cerrar} className="min-h-11 cursor-pointer rounded-lg border border-borde bg-superficie font-semibold hover:bg-fondo">
              Volver
            </button>
            <button
              type="submit"
              disabled={!coincide || pendiente}
              className="min-h-11 cursor-pointer rounded-lg bg-peligro font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendiente ? 'Suspendiendo…' : 'Suspender'}
            </button>
          </div>
        </form>
      ) : (
        <button
          ref={abrir}
          type="button"
          onClick={() => {
            setResultado({});
            setAbierto(true);
          }}
          className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-peligro px-3 text-sm font-semibold text-peligro transition-colors duration-150 hover:bg-peligro-suave sm:w-fit"
        >
          Suspender negocio
        </button>
      )}
    </div>
  );
}
