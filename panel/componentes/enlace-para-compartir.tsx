'use client';

import { Check, Copy, MessageCircle } from 'lucide-react';
import { useState } from 'react';

/**
 * Enlace de un solo uso (invitación o recuperación) para que el dueño se lo pase a la persona.
 * El panel no lo guarda: si se pierde, se genera otro (y el anterior deja de servir).
 */
export function EnlaceParaCompartir({ enlace, mensaje, vence }: { enlace: string; mensaje: string; vence: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
    } catch {
      // Sin permiso para el portapapeles: el enlace queda a la vista para copiarlo a mano.
      setCopiado(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-exito bg-exito-suave p-3">
      <label htmlFor="enlace" className="text-sm font-semibold text-exito">
        Enlace listo. Envíaselo solo a esa persona.
      </label>
      <input id="enlace" readOnly value={enlace} onFocus={(e) => e.currentTarget.select()} className="min-h-11 w-full rounded-lg border border-borde bg-superficie px-3 text-sm" />
      <p className="text-sm">Sirve una sola vez para elegir la contraseña. Vence el {vence}</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={copiar} className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-borde bg-superficie font-semibold hover:bg-fondo">
          {copiado ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-marca font-semibold text-white hover:bg-marca-oscura"
        >
          <MessageCircle aria-hidden className="size-4" />
          WhatsApp
        </a>
      </div>
    </div>
  );
}
