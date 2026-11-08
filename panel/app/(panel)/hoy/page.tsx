import type { Metadata } from 'next';
import { VistaDeAgenda } from '@/componentes/vista-de-agenda';
import { hoyEn } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Hoy' };

/** Pantalla de inicio: las citas de hoy, en el día del negocio. */
export default async function PaginaHoy() {
  const usuario = await exigirUsuario('hoy');
  return <VistaDeAgenda usuario={usuario} fecha={hoyEn(usuario.negocio.zonaHoraria)} conTira={false} />;
}
