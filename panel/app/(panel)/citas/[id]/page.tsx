import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AvisoDeLaUrl } from '@/componentes/aviso-de-la-url';
import { AccionesCita } from '@/componentes/acciones-cita';
import { DetalleDeCita } from '@/componentes/detalle-de-cita';
import { accionesPosibles } from '@/lib/citas';
import { cita as leerCita } from '@/lib/datos';
import { fechaDe, horaLocal } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const usuario = await exigirUsuario('agenda');
  const c = await leerCita((await params).id);
  return { title: `${horaLocal(c.inicio, usuario.negocio.zonaHoraria)} · ${c.clienteNombre ?? 'Cita'}` };
}

const LISTO: Record<string, string> = {
  creada: 'Cita agendada.',
  reprogramada: 'Cita reprogramada.',
};

export default async function PaginaCita({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ listo?: string }> }) {
  const usuario = await exigirUsuario('agenda');
  const { id } = await params;
  const { listo } = await searchParams;
  const cita = await leerCita(id);
  const zona = usuario.negocio.zonaHoraria;
  const fecha = fechaDe(cita.inicio, zona);
  const mensaje = listo ? LISTO[listo] : undefined;

  return (
    <div className="ancho-formulario">
      <Link href={`/agenda?fecha=${fecha}`} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca">
        <ChevronLeft aria-hidden className="size-5" />
        Agenda del día
      </Link>

      <AvisoDeLaUrl mensaje={mensaje} />

      <div className="mb-4">
        <DetalleDeCita cita={cita} zona={zona} />
      </div>

      <AccionesCita citaId={cita.id} acciones={accionesPosibles(cita)} />
    </div>
  );
}
