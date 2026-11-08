import type { Metadata } from 'next';
import { VistaDeAgenda } from '@/componentes/vista-de-agenda';
import { esFechaValida, hoyEn } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Agenda' };

/** Cualquier día: ?fecha=AAAA-MM-DD (sin ella, hoy). */
export default async function PaginaAgenda({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const usuario = await exigirUsuario('agenda');
  const { fecha } = await searchParams;
  const dia = esFechaValida(fecha) ? fecha : hoyEn(usuario.negocio.zonaHoraria);
  return <VistaDeAgenda usuario={usuario} fecha={dia} conTira />;
}
