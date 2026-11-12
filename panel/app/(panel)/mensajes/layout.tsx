import type { ReactNode } from 'react';
import { exigirUsuario } from '@/lib/sesion';

/**
 * Si "Mensajes" no es del rol, "no existe" con código 404. Se decide aquí, fuera del loading.tsx:
 * dentro del esqueleto la respuesta ya habría salido con 200. La página lo vuelve a exigir, porque
 * un layout no se repinta al navegar entre sus páginas.
 */
export default async function SoloSuRol({ children }: { children: ReactNode }) {
  await exigirUsuario('mensajes');
  return children;
}
