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
import { AccionesCita } from '@/componentes/acciones-cita';
import { ProveedorDeAprobacion } from '@/componentes/acciones-con-deshacer';
import { BotonAprobar, TarjetaPorAprobar } from '@/componentes/por-aprobar-con-deshacer';

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
        <ProveedorDeAprobacion>
          <ul className="flex flex-col gap-3">
            {citas.map((c) => {
              const fecha = fechaDe(c.inicio, zona);
              const dia = diaRelativo(fecha, hoy) ?? fechaLarga(fecha);
              const acciones = accionesPosibles(c, ahora);
              const cliente = c.clienteNombre ?? 'Cliente sin nombre';
              return (
                <TarjetaPorAprobar key={c.id} citaId={c.id}>
                  <div className="mb-3 flex flex-col-reverse items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold first-letter:uppercase">
                        {dia} · <span className="whitespace-nowrap tabular-nums">{horaLocal(c.inicio, zona)}</span>
                      </p>
                      <p className="truncate">{cliente}</p>
                      <p className="text-sm text-suave">
                        {nombresDeServicios(c.servicios)} · {c.profesionalNombre} · <span className="tabular-nums">{pesos(c.precioTotalCop)}</span>
                      </p>
                    </div>
                    {c.aprobacionExpiraEn && <CuentaRegresiva hasta={c.aprobacionExpiraEn} ahora={ahora.getTime()} />}
                  </div>
                  {acciones.includes('aprobar') ? (
                    // Aprobar se puede deshacer unos segundos (aún no se le avisó al cliente); rechazar pide confirmación.
                    <AccionesCita
                      citaId={c.id}
                      acciones={acciones.filter((a) => a !== 'aprobar')}
                      antes={<BotonAprobar citaId={c.id} cliente={cliente} />}
                    />
                  ) : (
                    <p className="text-sm text-suave">Ya no se puede aprobar: el sistema la cancelará en unos minutos.</p>
                  )}
                  <Link href={`/citas/${c.id}`} className="mt-2 flex min-h-11 items-center justify-center gap-1 text-sm font-medium text-marca">
                    Ver detalle
                    <ChevronRight aria-hidden className="size-4" />
                  </Link>
                </TarjetaPorAprobar>
              );
            })}
          </ul>
        </ProveedorDeAprobacion>
      )}
      <p className="mt-4 text-center text-xs text-suave">Se muestran las de los próximos {DIAS_POR_APROBAR} días.</p>
    </div>
  );
}
