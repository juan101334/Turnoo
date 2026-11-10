import { Phone } from 'lucide-react';
import Link from 'next/link';
import { duracionLegible, duracionMinutos } from '@/lib/agenda';
import { nombresDeServicios, pesos, type Cita } from '@/lib/citas';
import { horaLocal } from '@/lib/fechas';
import { FaltaPara } from './falta-para';

/**
 * Arriba de Hoy: la cita que está pasando o la que sigue, para verla sin leer la lista.
 * Con el equipo completo (dueño sin filtro) dice también con qué barbero.
 */
export function BloqueSigue({
  cita,
  enCurso,
  zona,
  conBarbero,
  ahora,
  href,
  className = 'mb-4',
  id = 'sigue',
}: {
  cita: Cita;
  enCurso: boolean;
  zona: string;
  conBarbero: boolean;
  ahora: Date;
  href: string;
  className?: string;
  /** Hoy va dos veces (lista del celular y escritorio, una escondida): cada una con su id. */
  id?: string;
}) {
  return (
    <section aria-labelledby={`${id}-titulo`} className={`rounded-xl border border-marca/30 bg-marca-suave p-4 ${className}`}>
      <h2 id={`${id}-titulo`} className="mb-1 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold tracking-wide text-marca-oscura uppercase">
        {enCurso ? 'En curso' : 'Sigue'}
        <span className="font-medium tracking-normal normal-case">
          {enCurso ? `· hasta ${horaLocal(cita.fin, zona)}` : <FaltaPara inicio={cita.inicio} ahora={ahora.getTime()} />}
        </span>
      </h2>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className="cifras text-3xl font-bold text-texto">{horaLocal(cita.inicio, zona)}</span>
            <span className="text-lg font-semibold break-words">{cita.clienteNombre ?? 'Cliente sin nombre'}</span>
          </p>
          <p className="text-sm text-suave">
            {nombresDeServicios(cita.servicios)}
            {conBarbero && ` · ${cita.profesionalNombre}`} · {duracionLegible(duracionMinutos(cita))} · <span className="tabular-nums">{pesos(cita.precioTotalCop)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {cita.clienteTelefono && (
            <a
              href={`tel:+${cita.clienteTelefono}`}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-borde bg-superficie px-3 text-sm font-semibold hover:bg-fondo"
            >
              <Phone aria-hidden className="size-4" />
              Llamar
            </a>
          )}
          <Link href={href} className="flex min-h-11 items-center rounded-lg bg-marca px-4 text-sm font-semibold text-white hover:bg-marca-oscura">
            Ver cita
          </Link>
        </div>
      </div>
    </section>
  );
}
