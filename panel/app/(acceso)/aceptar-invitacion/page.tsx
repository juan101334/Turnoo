import type { Metadata } from 'next';
import { aceptarInvitacion } from '../acciones';
import { FormularioClaveNueva } from '../clave-nueva';

export const metadata: Metadata = { title: 'Crear contraseña' };

export default function PaginaAceptarInvitacion() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Te damos la bienvenida</h1>
      <p className="mb-5 text-sm text-suave">Crea la contraseña con la que vas a entrar.</p>
      <FormularioClaveNueva accion={aceptarInvitacion} boton="Crear contraseña" />
    </>
  );
}
