import type { Metadata } from 'next';
import { restablecerContrasena } from '../acciones';
import { FormularioClaveNueva } from '../clave-nueva';

export const metadata: Metadata = { title: 'Cambiar contraseña' };

export default function PaginaRestablecer() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Cambiar contraseña</h1>
      <p className="mb-5 text-sm text-suave">Escribe tu contraseña nueva. La anterior deja de servir.</p>
      <FormularioClaveNueva accion={restablecerContrasena} boton="Guardar contraseña" />
    </>
  );
}
