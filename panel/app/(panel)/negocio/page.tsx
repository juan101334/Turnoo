import type { Metadata } from 'next';
import { EnConstruccion } from '@/componentes/en-construccion';
import { SECCIONES } from '@/lib/navegacion';
import { exigirUsuario } from '@/lib/sesion';

export const metadata: Metadata = { title: SECCIONES.negocio.etiqueta };

export default async function Pagina() {
  await exigirUsuario('negocio');
  return <EnConstruccion titulo={SECCIONES.negocio.etiqueta} />;
}
