'use client';

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

/**
 * Confirmación propia, en español, en lugar de window.confirm (que no se puede leer bien, ni
 * traducir, ni darle estilo). Es un <dialog> modal con role="alertdialog":
 * - lo demás de la página queda inerte mientras está abierto;
 * - el foco empieza en la opción que no pierde nada ("Cancelar") y no sale del diálogo con Tab;
 * - Escape es lo mismo que cancelar;
 * - al cerrarse, el foco vuelve a donde estaba.
 */
export function DialogoConfirmar({
  abierto,
  titulo,
  children,
  confirmar,
  cancelar = 'Cancelar',
  peligro = false,
  alConfirmar,
  alCancelar,
}: {
  abierto: boolean;
  titulo: string;
  children: ReactNode;
  confirmar: string;
  cancelar?: string;
  /** El botón de confirmar en rojo: la acción pierde algo. */
  peligro?: boolean;
  alConfirmar: () => void;
  alCancelar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const botonCancelar = useRef<HTMLButtonElement>(null);
  const previo = useRef<Element | null>(null);
  const idTitulo = useId();
  const idTexto = useId();

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (abierto && !d.open) {
      previo.current = document.activeElement;
      d.showModal();
      botonCancelar.current?.focus();
    } else if (!abierto && d.open) {
      d.close();
      const p = previo.current;
      if (p instanceof HTMLElement && p.isConnected) p.focus();
    }
  }, [abierto]);

  /** Tab y Shift+Tab dan la vuelta dentro del diálogo, sin pasar a la barra del navegador. */
  function atraparFoco(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key !== 'Tab') return;
    const botones = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled])')];
    const primero = botones[0];
    const ultimo = botones.at(-1);
    if (!primero || !ultimo) return;
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  }

  return (
    <dialog
      ref={dialogo}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      aria-describedby={idTexto}
      onCancel={(e) => {
        // Escape: lo cierra el estado (alCancelar), no el navegador, para devolver el foco igual.
        e.preventDefault();
        alCancelar();
      }}
      onKeyDown={atraparFoco}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-borde bg-superficie p-5 text-texto shadow-flotante backdrop:bg-black/50 open:animate-entrar"
    >
      <h2 id={idTitulo} className="text-lg font-semibold">
        {titulo}
      </h2>
      <div id={idTexto} className="mt-2 flex flex-col gap-2 text-sm text-suave">
        {children}
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          ref={botonCancelar}
          type="button"
          onClick={alCancelar}
          className="min-h-11 cursor-pointer rounded-lg border border-borde px-4 font-semibold transition-colors duration-150 hover:bg-hundido"
        >
          {cancelar}
        </button>
        <button
          type="button"
          onClick={alConfirmar}
          className={`min-h-11 cursor-pointer rounded-lg px-4 font-semibold text-white transition-colors duration-150 ${peligro ? 'bg-peligro hover:opacity-90' : 'bg-marca hover:bg-marca-oscura'}`}
        >
          {confirmar}
        </button>
      </div>
    </dialog>
  );
}
