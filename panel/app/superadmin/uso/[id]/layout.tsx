import type { ReactNode } from 'react';
import { exigirSuperadmin } from '@/lib/sesion-superadmin';
import { negocio } from '@/lib/superadmin';

/**
 * Revisa que el negocio exista ANTES de su loading.tsx, igual que la ficha del negocio: así un id
 * que no existe responde 404 de verdad y no un esqueleto con 200. cache() evita la doble llamada.
 */
export default async function ExisteAntesDeCargar({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  // Antes de leer: Next arma este layout a la vez que el del superadmin, y a otro rol el backend le responde 403.
  await exigirSuperadmin();
  await negocio((await params).id);
  return children;
}
