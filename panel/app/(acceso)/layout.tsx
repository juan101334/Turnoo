import type { ReactNode } from 'react';

/** Pantallas sin sesión: una tarjeta centrada, cómoda con una mano en el celular. */
export default function LayoutAcceso({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-2xl font-bold tracking-tight text-marca">Turnoo</p>
        <div className="rounded-xl border border-borde bg-superficie p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
