import type { ReactNode } from 'react';
import { NavInferior, NavLateral } from '@/componentes/navegacion';
import { lateralDe, pestanasDe } from '@/lib/navegacion';
import { exigirUsuario } from '@/lib/sesion';

/**
 * Marco del panel con sesión. Cada página vuelve a exigir el usuario con su sección: el layout
 * no se vuelve a pintar al navegar entre páginas, así que no basta con revisarlo aquí.
 */
export default async function LayoutPanel({ children }: { children: ReactNode }) {
  const usuario = await exigirUsuario();
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl lg:gap-8 lg:px-6">
      <aside className="hidden w-60 shrink-0 py-6 lg:block">
        <p className="mb-6 px-3 text-xl font-bold tracking-tight text-marca">Turnoo</p>
        <NavLateral secciones={lateralDe(usuario.rol)} />
      </aside>
      <main className="min-w-0 flex-1 px-4 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:px-0 lg:py-6">{children}</main>
      <NavInferior pestanas={pestanasDe(usuario.rol)} />
    </div>
  );
}
