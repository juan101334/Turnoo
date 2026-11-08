import type { Metadata } from 'next';
import { EnConstruccion } from '@/componentes/en-construccion';
import { exigirUsuario } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Hoy' };

/** La agenda del día llega en el PR siguiente; por ahora confirma con quién entraste. */
export default async function PaginaHoy() {
  const usuario = await exigirUsuario('hoy');
  return (
    <>
      <p className="mb-1 text-sm text-suave">Hola, {usuario.nombre}</p>
      <EnConstruccion titulo="Hoy" />
    </>
  );
}
