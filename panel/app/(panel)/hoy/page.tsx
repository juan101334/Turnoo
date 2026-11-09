import type { Metadata } from 'next';
import { PrimerosPasos } from '@/componentes/primeros-pasos';
import { VistaDeAgenda } from '@/componentes/vista-de-agenda';
import { tituloConCita } from '@/lib/titulo-con-cita';
import { hoyEn } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';

type Busqueda = Promise<{ barbero?: string; cita?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: Busqueda }): Promise<Metadata> {
  return { title: await tituloConCita('Hoy', (await searchParams).cita) };
}

/**
 * Pantalla de inicio: las citas de hoy, en el día del negocio. El dueño puede filtrar: ?barbero=id.
 * En el escritorio, ?cita=id abre el detalle al lado de la grilla.
 */
export default async function PaginaHoy({ searchParams }: { searchParams: Busqueda }) {
  const usuario = await exigirUsuario('hoy');
  const { barbero, cita } = await searchParams;
  return (
    <VistaDeAgenda
      usuario={usuario}
      fecha={hoyEn(usuario.negocio.zonaHoraria)}
      conTira={false}
      ruta="/hoy"
      barbero={barbero}
      citaAbierta={cita}
      arriba={usuario.rol === 'dueno' ? <PrimerosPasos /> : undefined}
    />
  );
}
