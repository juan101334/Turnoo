import { ChevronRight, Inbox } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CuentaRegresiva } from '@/componentes/cuenta-regresiva';
import { RefrescoAutomatico } from '@/componentes/refresco-automatico';
import { accionesPosibles, nombresDeServicios, pesos } from '@/lib/citas';
import { citasPorAprobar, DIAS_POR_APROBAR } from '@/lib/datos';
import { diaRelativo, fechaDe, fechaLarga, horaLocal, hoyEn } from '@/lib/fechas';
import { SECCIONES } from '@/lib/navegacion';
import { exigirUsuario } from '@/lib/sesion';
import { AccionesCita } from '../citas/[id]/acciones-cita';

export const metadata: Metadata = { title: SECCIONES.porAprobar.etiqueta };

/**
 * Citas que pidió un cliente y esperan el visto bueno del dueño. Si nadie responde a tiempo, el
 * sistema las cancela y el horario queda libre: por eso la que vence primero va arriba.
 */
export default async function PaginaPorAprobar() {
  const usuario = await exigirUsuario('porAprobar');
  const zona = usuario.negocio.zonaHoraria;
  const ahora = new Date();
  const hoy = hoyEn(zona, ahora);
  const citas = await citasPorAprobar(ahora);

  return (
    <div className="mx-auto max-w-2xl">
      <RefrescoAutomatico />
      <h1 className="text-2xl font-semibold">Por aprobar</h1>
      <p className="mb-4 text-sm text-suave">
        Si no las apruebas antes de que venza el plazo, se cancelan solas y el horario queda libre.
      </p>
      <p className="sr-only" aria-live="polite">
        {citas.length === 1 ? '1 cita por aprobar' : `${citas.length} citas por aprobar`}
      </p>

      {citas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-borde bg-superficie px-6 py-10 text-center text-suave">
          <Inbox aria-hidden className="size-8" />
          <p>No hay citas esperando tu aprobación.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {citas.map((c) => {
            const fecha = fechaDe(c.inicio, zona);
            const dia = diaRelativo(fecha, hoy) ?? fechaLarga(fecha);
            return (
              <li key={c.id} className="rounded-xl border border-borde bg-superficie p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold first-letter:uppercase">
                      {dia} · <span className="tabular-nums">{horaLocal(c.inicio, zona)}</span>
                    </p>
                    <p className="truncate">{c.clienteNombre ?? 'Cliente sin nombre'}</p>
                    <p className="truncate text-sm text-suave">
                      {nombresDeServicios(c.servicios)} · {c.profesionalNombre} · <span className="tabular-nums">{pesos(c.precioTotalCop)}</span>
                    </p>
                  </div>
                  {c.aprobacionExpiraEn && <CuentaRegresiva hasta={c.aprobacionExpiraEn} ahora={ahora.getTime()} />}
                </div>
                {accionesPosibles(c, ahora).length > 0 ? (
                  <AccionesCita citaId={c.id} acciones={accionesPosibles(c, ahora)} />
                ) : (
                  <p className="text-sm text-suave">Ya no se puede aprobar: el sistema la cancelará en unos minutos.</p>
                )}
                <Link href={`/citas/${c.id}`} className="mt-2 flex min-h-11 items-center justify-center gap-1 text-sm font-medium text-marca">
                  Ver detalle
                  <ChevronRight aria-hidden className="size-4" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-center text-xs text-suave">Se muestran las de los próximos {DIAS_POR_APROBAR} días.</p>
    </div>
  );
}
