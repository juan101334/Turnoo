import type { Metadata } from 'next';
import { BotonCerrarSesion } from '@/componentes/cerrar-sesion';
import { SeccionContrasena } from '@/componentes/seccion-contrasena';
import { SeccionOtrosDispositivos } from '@/componentes/seccion-otros-dispositivos';
import { SeccionPerfil } from '@/componentes/seccion-perfil';
import { SelectorDeTema } from '@/componentes/selector-de-tema';
import { exigirUsuario } from '@/lib/sesion';
import { temaElegido } from '@/lib/tema-servidor';
import { cambiarContrasena, cambiarNombre, cerrarOtrasSesiones } from './acciones';

export const metadata: Metadata = { title: 'Cuenta' };

const ROLES = { dueno: 'Dueño del negocio', empleado: 'Barbero', superadmin: 'Superadmin' } as const;

/** Tu perfil, tu contraseña, las sesiones en otros dispositivos, el tema y cerrar sesión. */
export default async function PaginaCuenta() {
  const usuario = await exigirUsuario('cuenta');
  return (
    <div className="ancho-formulario">
      <h1 className="mb-4 text-2xl font-semibold">Cuenta</h1>
      <SeccionPerfil
        nombre={usuario.nombre}
        datos={[
          { etiqueta: 'Correo', valor: usuario.email },
          { etiqueta: 'Rol', valor: ROLES[usuario.rol] },
          { etiqueta: 'Negocio', valor: usuario.negocio.nombre },
        ]}
        accion={cambiarNombre}
        ayuda="Es el nombre de tu cuenta en el panel. El que ven los clientes en WhatsApp y en la agenda es el del barbero, y se cambia en Barberos y servicios."
      />

      <SeccionContrasena accion={cambiarContrasena} ayuda="Al cambiarla se cierra tu sesión en los demás celulares y computadores. Aquí sigues dentro." />
      <SeccionOtrosDispositivos accion={cerrarOtrasSesiones} />

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
