'use client';

import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAccionDiferida } from './accion-diferida';

/** La tarjeta desaparece al aprobar (y vuelve si se deshace o el backend la rechaza). */
export function TarjetaPorAprobar({ citaId, children }: { citaId: string; children: ReactNode }) {
  const { hechas } = useAccionDiferida();
  if (hechas.has(citaId)) return null;
  return <li className="rounded-xl border border-borde bg-superficie p-4">{children}</li>;
}

export function BotonAprobar({ citaId, cliente }: { citaId: string; cliente: string }) {
  const { hacer } = useAccionDiferida();
  return (
    <button
      type="button"
      onClick={() => hacer(citaId, cliente)}
      className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-marca px-3 font-semibold text-white transition-colors duration-150 hover:bg-marca-oscura"
    >
      <Check aria-hidden className="size-5" />
      Aprobar
    </button>
  );
}
