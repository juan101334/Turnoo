import type { Metadata } from 'next';
import { cambiarContrasena, cambiarNombre, cerrarOtrasSesiones } from '@/app/(panel)/cuenta/acciones';
import { BotonCerrarSesion } from '@/componentes/cerrar-sesion';
import { SeccionContrasena } from '@/componentes/seccion-contrasena';
import { SeccionOtrosDispositivos } from '@/componentes/seccion-otros-dispositivos';
import { SeccionPerfil } from '@/componentes/seccion-perfil';
import { SelectorDeTema } from '@/componentes/selector-de-tema';
import { exigirSuperadmin } from '@/lib/sesion-superadmin';
import { temaElegido } from '@/lib/tema-servidor';

export const metadata: Metadata = { title: 'Cuenta · Superadmin' };

/** La cuenta del superadmin: su perfil, la contraseña, las sesiones en otros dispositivos, el tema y cerrar sesión. */
export default async function PaginaCuentaSuperadmin() {
  const usuario = await exigirSuperadmin();
  return (
    <div className="ancho-formulario">
      <h1 className="mb-4 text-2xl font-semibold">Cuenta</h1>
      <SeccionPerfil
        nombre={usuario.nombre}
        datos={[
          { etiqueta: 'Correo', valor: usuario.email },
          { etiqueta: 'Rol', valor: 'Superadmin de Turnoo' },
        ]}
        accion={cambiarNombre}
        ayuda="Es el nombre de tu cuenta en el panel del superadmin."
      />
      <SeccionContrasena accion={cambiarContrasena} ayuda="Al cambiarla se cierra tu sesión en los demás dispositivos." />
      <SeccionOtrosDispositivos accion={cerrarOtrasSesiones} />

      {/* El tema del superadmin se elige solo aquí (la barra de arriba no lo lleva). */}
      <section aria-labelledby="apariencia" className="mb-4 rounded-xl border border-borde bg-superficie p-4">
        <h2 id="apariencia" className="mb-1 font-semibold">
          Apariencia
        </h2>
        <p className="mb-3 text-sm text-suave">Sistema sigue el modo claro u oscuro de tu celular o computador.</p>
        <SelectorDeTema tema={await temaElegido()} />
      </section>

      <BotonCerrarSesion />
    </div>
  );
}
