import type { Metadata } from 'next';
import { VistaDeAgenda } from '@/componentes/vista-de-agenda';
import { esFechaValida, hoyEn } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Agenda' };

/** Cualquier día: ?fecha=AAAA-MM-DD (sin ella, hoy). El dueño puede filtrar: ?barbero=id. */
export default async function PaginaAgenda({ searchParams }: { searchParams: Promise<{ fecha?: string; barbero?: string }> }) {
  const usuario = await exigirUsuario('agenda');
  const { fecha, barbero } = await searchParams;
  const dia = esFechaValida(fecha) ? fecha : hoyEn(usuario.negocio.zonaHoraria);
  return <VistaDeAgenda usuario={usuario} fecha={dia} conTira ruta="/agenda" barbero={barbero} />;
}
