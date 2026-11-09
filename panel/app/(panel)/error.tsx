'use client';

import { CircleAlert } from 'lucide-react';

/** Error al cargar una sección (el backend falló o no respondió). Se puede reintentar. */
export default function ErrorDelPanel({ retry }: { error: Error; retry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-borde bg-superficie px-6 py-12 text-center">
      <CircleAlert aria-hidden className="size-8 text-peligro" />
      <p className="font-medium">No pudimos cargar esta sección</p>
      <p className="text-sm text-suave">Revisa tu conexión e intenta de nuevo.</p>
      <button
        type="button"
        onClick={() => retry()}
        className="min-h-11 cursor-pointer rounded-lg bg-marca px-5 font-semibold text-white hover:bg-marca-oscura"
      >
        Reintentar
      </button>
    </div>
  );
}
