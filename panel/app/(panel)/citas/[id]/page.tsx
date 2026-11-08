import { ChevronLeft, MessageCircle, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Aviso } from '@/componentes/aviso';
import { InsigniaEstado } from '@/componentes/estado-cita';
import { accionesPosibles, pesos, telefonoLegible } from '@/lib/citas';
import { cita as leerCita } from '@/lib/datos';
import { fechaDe, fechaLarga, horaLocal, tiempoRestante } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';
import { AccionesCita } from './acciones-cita';

export const metadata: Metadata = { title: 'Cita' };

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
    <div className="mx-auto max-w-xl">
      <Link href={`/agenda?fecha=${fecha}`} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca">
        <ChevronLeft aria-hidden className="size-5" />
        Agenda del día
      </Link>

      {mensaje && (
        <div className="mb-3">
          <Aviso tipo="exito">{mensaje}</Aviso>
        </div>
      )}

      <section className="mb-4 rounded-2xl border border-borde bg-superficie p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tabular-nums">{horaLocal(cita.inicio, zona)}</h1>
            <p className="text-suave first-letter:uppercase">
              {fechaLarga(fecha)} · hasta {horaLocal(cita.fin, zona)}
            </p>
          </div>
          <InsigniaEstado estado={cita.estado} />
        </div>
        {cita.estado === 'por_aprobar' && cita.aprobacionExpiraEn && (
          <p className="mb-3 text-sm text-aviso">
            {tiempoRestante(cita.aprobacionExpiraEn) === 'vencido'
              ? 'El plazo para aprobarla ya venció.'
              : `Hay que aprobarla ${tiempoRestante(cita.aprobacionExpiraEn)}.`}
          </p>
        )}

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-suave">Cliente</dt>
          <dd className="font-medium">{cita.clienteNombre ?? 'Sin nombre'}</dd>
          <dt className="text-suave">Barbero</dt>
          <dd>{cita.profesionalNombre}</dd>
          <dt className="text-suave">Servicios</dt>
          <dd>
            <ul>
              {cita.servicios.map((s) => (
                <li key={s.servicioId} className="flex justify-between gap-2">
                  <span>
                    {s.nombre} <span className="text-suave">· {s.duracionMinutos} min</span>
                  </span>
                  <span className="tabular-nums">{pesos(s.precioCop)}</span>
                </li>
              ))}
            </ul>
          </dd>
          <dt className="text-suave">Total</dt>
          <dd className="font-semibold tabular-nums">{pesos(cita.precioTotalCop)}</dd>
          {cita.notas && (
            <>
              <dt className="text-suave">Notas</dt>
              <dd className="whitespace-pre-line">{cita.notas}</dd>
            </>
          )}
        </dl>

        {cita.clienteTelefono && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a
              href={`tel:+${cita.clienteTelefono}`}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-borde font-medium hover:bg-fondo"
            >
              <Phone aria-hidden className="size-4" />
              Llamar
            </a>
            <a
              href={`https://wa.me/${cita.clienteTelefono}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-borde font-medium hover:bg-fondo"
            >
              <MessageCircle aria-hidden className="size-4" />
              WhatsApp
            </a>
            <p className="col-span-2 text-center text-xs text-suave">{telefonoLegible(cita.clienteTelefono)}</p>
          </div>
        )}
      </section>

      <AccionesCita citaId={cita.id} acciones={accionesPosibles(cita)} />
    </div>
  );
}
