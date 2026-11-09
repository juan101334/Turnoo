import { KeyRound } from 'lucide-react';
import type { Metadata } from 'next';
import { BotonCerrarSesion } from '@/componentes/cerrar-sesion';
import { CampoContrasena } from '@/componentes/formulario';
import { FormularioConEstado } from '@/componentes/formulario-con-estado';
import { CLAVE_MIN } from '@/lib/claves';
import { exigirUsuario } from '@/lib/sesion';
import { cambiarContrasena } from './acciones';

export const metadata: Metadata = { title: 'Cuenta' };

const ROLES = { dueno: 'Dueño del negocio', empleado: 'Barbero', superadmin: 'Superadmin' } as const;

/** Quién eres, cambiar tu contraseña y cerrar sesión. */
export default async function PaginaCuenta() {
  const usuario = await exigirUsuario('cuenta');
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold">Cuenta</h1>
      <div className="mb-4 rounded-xl border border-borde bg-superficie p-4">
        <p className="text-lg font-medium">{usuario.nombre}</p>
        <p className="text-sm text-suave">
          {ROLES[usuario.rol]} · {usuario.negocio.nombre}
        </p>
      </div>

      <section aria-labelledby="cambiar-contrasena" className="mb-4 rounded-xl border border-borde bg-superficie p-4">
        <h2 id="cambiar-contrasena" className="mb-1 flex items-center gap-2 font-semibold">
          <KeyRound aria-hidden className="size-5 text-marca" />
          Cambiar contraseña
        </h2>
        <p className="mb-3 text-sm text-suave">Al cambiarla se cierra tu sesión en los demás celulares y computadores. Aquí sigues dentro.</p>
        <FormularioConEstado limpiar accion={cambiarContrasena} boton="Cambiar contraseña" enviando="Cambiando…">
          <CampoContrasena id="actual" name="actual" etiqueta="Contraseña actual" autoComplete="current-password" required />
          <CampoContrasena id="nueva" name="nueva" etiqueta="Contraseña nueva" ayuda={`Mínimo ${CLAVE_MIN} caracteres.`} autoComplete="new-password" minLength={CLAVE_MIN} required />
          <CampoContrasena id="confirmacion" name="confirmacion" etiqueta="Repite la contraseña nueva" autoComplete="new-password" required />
        </FormularioConEstado>
      </section>

      <div className="max-w-xs">
        <BotonCerrarSesion />
      </div>
    </div>
  );
}
