import type { ReactNode } from 'react';
import { NavInferior, NavLateral } from '@/componentes/navegacion';
import { ErrorDelBackend } from '@/lib/backend';
import { citasPorAprobar, conversaciones } from '@/lib/datos';
import { lateralDe, pestanasDe, type Contadores } from '@/lib/navegacion';
import { exigirUsuario, type UsuarioDelNegocio } from '@/lib/sesion';

/**
 * Números junto a las secciones del dueño: citas por aprobar y clientes que esperan a una persona.
 * Si el backend falla, el panel se muestra igual, sin ese número: no vale la pena tumbar todas
 * las páginas por él.
 */
async function contar(leer: () => Promise<unknown[]>): Promise<number | undefined> {
  try {
    return (await leer()).length;
  } catch (error) {
    if (error instanceof ErrorDelBackend) return undefined;
    throw error;
  }
}

async function contadoresDe(usuario: UsuarioDelNegocio): Promise<Contadores> {
  if (usuario.rol !== 'dueno') return {};
  const [porAprobar, mensajes] = await Promise.all([contar(() => citasPorAprobar()), contar(() => conversaciones('humano'))]);
  return { porAprobar, mensajes };
}

/**
 * Marco del panel con sesión. Cada página vuelve a exigir el usuario con su sección: el layout
 * no se vuelve a pintar al navegar entre páginas, así que no basta con revisarlo aquí.
 */
export default async function LayoutPanel({ children }: { children: ReactNode }) {
  const usuario = await exigirUsuario();
  const contadores = await contadoresDe(usuario);
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl lg:gap-8 lg:px-6">
      <aside className="hidden w-60 shrink-0 py-6 lg:block">
        <p className="mb-6 px-3 text-xl font-bold tracking-tight text-marca">Turnoo</p>
        <NavLateral secciones={lateralDe(usuario.rol)} contadores={contadores} />
      </aside>
      <main className="min-w-0 flex-1 px-4 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:px-0 lg:py-6">{children}</main>
      <NavInferior pestanas={pestanasDe(usuario.rol)} contadores={contadores} />
    </div>
  );
}
