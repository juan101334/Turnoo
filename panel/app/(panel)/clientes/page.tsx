import type { Metadata } from 'next';
import { EnConstruccion } from '@/componentes/en-construccion';
import { SECCIONES } from '@/lib/navegacion';
import { exigirUsuario } from '@/lib/sesion';

export const metadata: Metadata = { title: SECCIONES.clientes.etiqueta };

export default async function Pagina() {
  await exigirUsuario('clientes');
  return <EnConstruccion titulo={SECCIONES.clientes.etiqueta} />;
}
