import type { Metadata } from 'next';
import { BotonCerrarSesion } from '@/componentes/cerrar-sesion';
import { exigirUsuario } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Cuenta' };

const ROLES = { dueno: 'Dueño del negocio', empleado: 'Barbero', superadmin: 'Superadmin' } as const;

export default async function PaginaCuenta() {
  const usuario = await exigirUsuario('cuenta');
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Cuenta</h1>
      <div className="mb-6 rounded-2xl border border-borde bg-superficie p-4">
        <p className="text-lg font-medium">{usuario.nombre}</p>
        <p className="text-sm text-suave">{ROLES[usuario.rol]}</p>
      </div>
      <div className="max-w-xs">
        <BotonCerrarSesion />
      </div>
    </>
  );
}
