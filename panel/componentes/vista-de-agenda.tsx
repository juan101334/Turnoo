import { CalendarPlus } from 'lucide-react';
import Link from 'next/link';
import { citasDelDia } from '@/lib/datos';
import { diaRelativo, fechaLarga, hoyEn } from '@/lib/fechas';
import type { UsuarioDelNegocio } from '@/lib/sesion';
import { ListaDeCitas } from './lista-de-citas';
import { TiraDeDias } from './tira-de-dias';

/** Agenda de un día: encabezado, tira de días (opcional), botón de nueva cita y la lista. */
export async function VistaDeAgenda({ usuario, fecha, conTira }: { usuario: UsuarioDelNegocio; fecha: string; conTira: boolean }) {
  const zona = usuario.negocio.zonaHoraria;
  const hoy = hoyEn(zona);
  const citas = await citasDelDia(fecha, zona);
  const relativo = diaRelativo(fecha, hoy);
  const esDueno = usuario.rol === 'dueno';

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-suave">{usuario.negocio.nombre}</p>
          <h1 className="text-2xl font-semibold">{relativo ?? 'Agenda'}</h1>
          <p className="text-sm text-suave first-letter:uppercase">{fechaLarga(fecha)}</p>
        </div>
        <Link
          href={`/citas/nueva?fecha=${fecha < hoy ? hoy : fecha}`}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-marca px-4 font-semibold text-white transition-colors duration-150 hover:bg-marca-oscura"
        >
          <CalendarPlus aria-hidden className="size-5" />
          Nueva cita
        </Link>
      </div>
      {conTira && (
        <div className="mb-4">
          <TiraDeDias seleccionada={fecha} hoy={hoy} enlace={(f) => `/agenda?fecha=${f}`} />
          <form action="/agenda" className="mt-2 flex items-center gap-2 text-sm">
            <label htmlFor="otra-fecha" className="text-suave">
              Otra fecha
            </label>
            <input id="otra-fecha" type="date" name="fecha" defaultValue={fecha} className="min-h-11 rounded-lg border border-borde bg-superficie px-2 text-base" />
            <button type="submit" className="min-h-11 cursor-pointer rounded-lg border border-borde bg-superficie px-3 font-medium hover:bg-fondo">
              Ver
            </button>
          </form>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {citas.length === 1 ? '1 cita' : `${citas.length} citas`}
      </p>
      <ListaDeCitas
        citas={citas}
        zona={zona}
        mostrarBarbero={esDueno}
        {...(fecha === hoy && { ahora: new Date() })}
        vacia={<p>{relativo === 'Hoy' ? 'No hay citas para hoy.' : 'No hay citas este día.'}</p>}
      />
    </>
  );
}
