import type { ReactNode } from 'react';
import { negocio } from '@/lib/superadmin';

/**
 * Revisa que el negocio exista ANTES de su loading.tsx. Lo que se decide fuera del esqueleto llega antes
 * de que Next empiece a enviar la página, así que un id que no existe responde 404 de verdad (dentro
 * del esqueleto ya saldría con 200). La página lo vuelve a leer: cache() lo deja en una sola llamada.
 */
export default async function ExisteAntesDeCargar({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  await negocio((await params).id);
  return children;
}
