import type { ReactNode } from 'react';
import { LogoTurnoo } from '@/componentes/marca';

/** Pantallas sin sesión: una tarjeta centrada, cómoda con una mano en el celular. */
export default function LayoutAcceso({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <LogoTurnoo className="mx-auto mb-6 block h-10" />
        <div className="rounded-xl border border-borde bg-superficie p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
