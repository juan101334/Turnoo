import type { ReactNode } from 'react';
import { servicioDelBarbero } from '@/lib/datos';

/**
 * Revisa que el servicio del barbero exista ANTES de su loading.tsx. Lo que se decide fuera del esqueleto llega antes
 * de que Next empiece a enviar la página, así que un id que no existe responde 404 de verdad (dentro
 * del esqueleto ya saldría con 200). La página lo vuelve a leer: cache() lo deja en una sola llamada.
 */
export default async function ExisteAntesDeCargar({ children, params }: { children: ReactNode; params: Promise<{ id: string; servicioId: string }> }) {
  const { id, servicioId } = await params;
  await servicioDelBarbero(id, servicioId);
  return children;
}
