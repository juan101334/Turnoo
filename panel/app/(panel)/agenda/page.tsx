import type { Metadata } from 'next';
import { VistaDeAgenda } from '@/componentes/vista-de-agenda';
import { tituloConCita } from '@/lib/titulo-con-cita';
import { esFechaValida, hoyEn } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';

type Busqueda = Promise<{ fecha?: string; barbero?: string; cita?: string; vista?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: Busqueda }): Promise<Metadata> {
  return { title: await tituloConCita('Agenda', (await searchParams).cita) };
}

/**
 * Cualquier día: ?fecha=AAAA-MM-DD (sin ella, hoy). El dueño puede filtrar: ?barbero=id.
 * En el escritorio, ?cita=id abre el detalle al lado de la grilla y ?vista=semana muestra la
 * semana de un barbero (cualquier otro valor es el día).
 */
export default async function PaginaAgenda({ searchParams }: { searchParams: Busqueda }) {
  const usuario = await exigirUsuario('agenda');
  const { fecha, barbero, cita, vista } = await searchParams;
  const dia = esFechaValida(fecha) ? fecha : hoyEn(usuario.negocio.zonaHoraria);
  return <VistaDeAgenda usuario={usuario} fecha={dia} conTira ruta="/agenda" barbero={barbero} citaAbierta={cita} vista={vista === 'semana' ? 'semana' : 'dia'} />;
}
