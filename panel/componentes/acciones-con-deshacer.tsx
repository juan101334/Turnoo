'use client';

import type { ReactNode } from 'react';
import { aprobarCitaDiferida, completarCita } from '@/app/(panel)/citas/acciones';
import { ProveedorDeAccionDiferida } from './accion-diferida';

const avisoCompletada = (cliente: string) => `Completada: ${cliente}.`;
const avisoAprobada = (cliente: string) => `Aprobada: ${cliente}.`;

/** "Completada" desde la tarjeta de la agenda. */
export function ProveedorDeMarcado({ children }: { children: ReactNode }) {
  return (
    <ProveedorDeAccionDiferida accion={completarCita} aviso={avisoCompletada}>
      {children}
    </ProveedorDeAccionDiferida>
  );
}

/** "Aprobar" en la lista de por aprobar: el cliente recibe el aviso solo si no se deshace. */
export function ProveedorDeAprobacion({ children }: { children: ReactNode }) {
  return (
    <ProveedorDeAccionDiferida accion={aprobarCitaDiferida} aviso={avisoAprobada}>
      {children}
    </ProveedorDeAccionDiferida>
  );
}
