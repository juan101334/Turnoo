import type { ReactNode } from 'react';
import { exigirSuperadmin } from '@/lib/sesion-superadmin';
import { negocio } from '@/lib/superadmin';

/**
 * Revisa que el negocio exista ANTES de su loading.tsx. Lo que se decide fuera del esqueleto llega antes
 * de que Next empiece a enviar la página, así que un id que no existe responde 404 de verdad (dentro
 * del esqueleto ya saldría con 200). La página lo vuelve a leer: cache() lo deja en una sola llamada.
 */
export default async function ExisteAntesDeCargar({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  // Antes de leer: Next arma este layout a la vez que el del superadmin, y a otro rol el backend le responde 403.
  await exigirSuperadmin();
  await negocio((await params).id);
  return children;
}
