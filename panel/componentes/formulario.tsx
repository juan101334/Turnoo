'use client';

import { useFormStatus } from 'react-dom';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

/** Campo con etiqueta siempre visible, ayuda y error debajo. 16 px: el iPhone no hace zoom. */
export function Campo({
  etiqueta,
  ayuda,
  error,
  id,
  ...input
}: { etiqueta: string; ayuda?: string; error?: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  const idError = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={[idAyuda, idError].filter(Boolean).join(' ') || undefined}
        className="min-h-11 rounded-lg border border-borde bg-superficie px-3 text-base aria-invalid:border-peligro"
        {...input}
      />
      {ayuda && (
        <p id={idAyuda} className="text-sm text-suave">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className="text-sm text-peligro">
          {error}
        </p>
      )}
    </div>
  );
}

/** Lista desplegable con etiqueta visible y ayuda debajo, igual que Campo. */
export function CampoSeleccion({
  etiqueta,
  ayuda,
  id,
  children,
  ...select
}: { etiqueta: string; ayuda?: string; id: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      <select
        id={id}
        aria-describedby={ayuda ? `${id}-ayuda` : undefined}
        className="min-h-11 rounded-lg border border-borde bg-superficie px-3 text-base"
        {...select}
      >
        {children}
      </select>
      {ayuda && (
        <p id={`${id}-ayuda`} className="text-sm text-suave">
          {ayuda}
        </p>
      )}
    </div>
  );
}

const ESTILOS = {
  primario: 'bg-marca text-white hover:bg-marca-oscura',
  secundario: 'border border-borde bg-superficie text-texto hover:bg-fondo',
  peligro: 'bg-peligro text-white hover:opacity-90',
} as const;

/** Botón de envío: se desactiva y avisa mientras el formulario se procesa. */
export function BotonEnviar({ children, enviando, variante = 'primario' }: { children: ReactNode; enviando: string; variante?: keyof typeof ESTILOS }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`min-h-11 w-full cursor-pointer rounded-lg px-4 font-semibold transition-colors duration-150 disabled:cursor-wait disabled:opacity-70 ${ESTILOS[variante]}`}
    >
      {pending ? enviando : children}
    </button>
  );
}
