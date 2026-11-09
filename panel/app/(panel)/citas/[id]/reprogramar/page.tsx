import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FormularioDeHora } from '@/componentes/formulario-de-hora';
import { HorasLibres } from '@/componentes/horas-libres';
import { TiraDeDias } from '@/componentes/tira-de-dias';
import { horasLibres } from '@/lib/agenda';
import { accionesPosibles, nombresDeServicios } from '@/lib/citas';
import { cita as leerCita, huecosDelDia } from '@/lib/datos';
import { esFechaValida, fechaDe, fechaLarga, horaLocal, hoyEn, partesDelDia } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';
import { reprogramarCita } from '../../acciones';

export const metadata: Metadata = { title: 'Reprogramar cita' };

/** Misma cita, mismos servicios (misma duración): solo cambia el día y la hora. Igual que Nueva cita. */
export default async function PaginaReprogramar({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fecha?: string }> }) {
  const usuario = await exigirUsuario('agenda');
  const { id } = await params;
  const cita = await leerCita(id);
  if (!accionesPosibles(cita).includes('reprogramar')) redirect(`/citas/${cita.id}`);

  const zona = usuario.negocio.zonaHoraria;
  const hoy = hoyEn(zona);
  const { fecha } = await searchParams;
  const actual = fechaDe(cita.inicio, zona);
  const dia = esFechaValida(fecha) && fecha >= hoy ? fecha : actual >= hoy ? actual : hoy;
  const horas = horasLibres(
    await huecosDelDia(
      cita.profesionalId,
      cita.servicios.map((s) => s.servicioId),
      dia,
    ),
    zona,
  );
  const { semana, dia: numero } = partesDelDia(dia);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/citas/${cita.id}`} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca">
        <ChevronLeft aria-hidden className="size-5" />
        Volver a la cita
      </Link>
      <h1 className="text-2xl font-semibold">Reprogramar</h1>
      <p className="mb-4 text-sm text-suave">
        {cita.clienteNombre ?? 'Cliente sin nombre'} · {nombresDeServicios(cita.servicios)} con {cita.profesionalNombre}. Ahora:{' '}
        {fechaLarga(actual)}, {horaLocal(cita.inicio, zona)}
      </p>
      <div className="mb-4">
        <TiraDeDias seleccionada={dia} hoy={hoy} enlace={(f) => `/citas/${cita.id}/reprogramar?fecha=${f}`} />
      </div>
      <p className="mb-2 font-medium first-letter:uppercase">{fechaLarga(dia)}</p>
      {horas.length > 0 ? (
        <FormularioDeHora
          accion={reprogramarCita.bind(null, cita.id)}
          horas={horas}
          resumen={`${semana} ${numero} · ${cita.clienteNombre ?? 'Cliente sin nombre'}`}
          boton="Guardar la nueva hora"
          enviando="Guardando…"
        />
      ) : (
        <HorasLibres horas={[]} />
      )}
    </div>
  );
}
