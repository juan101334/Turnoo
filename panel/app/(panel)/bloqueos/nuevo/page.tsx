import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { barberos } from '@/lib/datos';
import { hoyEn } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';
import { FormularioBloqueo } from './formulario';

export const metadata: Metadata = { title: 'Bloquear horas' };

export default async function PaginaNuevoBloqueo() {
  const usuario = await exigirUsuario('bloqueos');
  const esDueno = usuario.rol === 'dueno';
  const equipo = esDueno ? (await barberos()).filter((b) => b.activo).map(({ id, nombre }) => ({ id, nombre })) : null;
  return (
    <div className="mx-auto max-w-xl">
      <Link href="/bloqueos" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca">
        <ChevronLeft aria-hidden className="size-5" />
        Bloqueos
      </Link>
      <h1 className="text-2xl font-semibold">Bloquear horas</h1>
      <p className="mb-4 text-sm text-suave">
        {esDueno ? 'Para un barbero o para todo el negocio.' : 'En tu agenda.'} Si ya hay citas a esa hora, te mostramos cuáles.
      </p>
      <FormularioBloqueo hoy={hoyEn(usuario.negocio.zonaHoraria)} barberos={equipo} />
    </div>
  );
}
