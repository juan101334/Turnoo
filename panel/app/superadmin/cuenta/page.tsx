import { KeyRound } from 'lucide-react';
import type { Metadata } from 'next';
import { cambiarContrasena } from '@/app/(panel)/cuenta/acciones';
import { BotonCerrarSesion } from '@/componentes/cerrar-sesion';
import { CampoContrasena } from '@/componentes/formulario';
import { FormularioConEstado } from '@/componentes/formulario-con-estado';
import { CLAVE_MIN } from '@/lib/claves';
import { exigirSuperadmin } from '@/lib/sesion-superadmin';

export const metadata: Metadata = { title: 'Cuenta · Superadmin' };

/** La cuenta del superadmin: cambiar la contraseña y cerrar sesión. */
export default async function PaginaCuentaSuperadmin() {
  const usuario = await exigirSuperadmin();
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-2xl font-semibold">Cuenta</h1>
      <div className="mb-4 rounded-xl border border-borde bg-superficie p-4">
        <p className="text-lg font-medium">{usuario.nombre}</p>
        <p className="text-sm text-suave">Superadmin de Turnoo</p>
      </div>
      <section aria-labelledby="cambiar-contrasena" className="mb-4 rounded-xl border border-borde bg-superficie p-4">
        <h2 id="cambiar-contrasena" className="mb-1 flex items-center gap-2 font-semibold">
          <KeyRound aria-hidden className="size-5 text-marca" />
          Cambiar contraseña
        </h2>
        <p className="mb-3 text-sm text-suave">Al cambiarla se cierra tu sesión en los demás dispositivos.</p>
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
