'use client';

import { CornerDownRight } from 'lucide-react';

/**
 * Lleva una pregunta sin respuesta al formulario de "Agregar pregunta": la escribe en el campo
 * Pregunta y deja el cursor en Respuesta. El texto no viaja en la URL.
 */
export function UsarPregunta({ texto, pregunta, respuesta }: { texto: string; pregunta: string; respuesta: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const campo = document.getElementById(pregunta) as HTMLInputElement | null;
        const destino = document.getElementById(respuesta) as HTMLTextAreaElement | null;
        if (!campo || !destino) return;
        campo.value = texto;
        destino.scrollIntoView({ block: 'center', behavior: 'smooth' });
        destino.focus({ preventScroll: true });
      }}
      className="flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-borde bg-superficie px-3 text-sm font-semibold text-marca hover:bg-marca-suave"
    >
      <CornerDownRight aria-hidden className="size-4" />
      Responder
    </button>
  );
}
