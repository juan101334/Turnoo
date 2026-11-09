import { CalendarOff, CalendarPlus, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AccionPrincipal } from '@/componentes/accion-principal';
import { citasQueSeCruzan, describirBloqueo } from '@/lib/bloqueos';
import { barberos, bloqueosEntre, citasEntre } from '@/lib/datos';
import { horaLocal, hoyEn, limitesDelDia, sumarDias } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';
import { QuitarBloqueo } from './quitar';

export const metadata: Metadata = { title: 'Bloqueos' };

/** Lo que se muestra: de hoy a 60 días (el backend admite hasta 62 por consulta). */
const DIAS = 60;

export default async function PaginaBloqueos() {
  const usuario = await exigirUsuario('bloqueos');
  const zona = usuario.negocio.zonaHoraria;
  const hoy = hoyEn(zona);
  const { desde } = limitesDelDia(hoy, zona);
  const { desde: hasta } = limitesDelDia(sumarDias(hoy, DIAS), zona);
  const esDueno = usuario.rol === 'dueno';

  const [bloqueos, citas, equipo] = await Promise.all([bloqueosEntre(desde, hasta), citasEntre(desde, hasta), esDueno ? barberos() : Promise.resolve([])]);
  const nombreDe = new Map(equipo.map((b) => [b.id, b.nombre]));

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-1 flex items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">{esDueno ? 'Bloqueos' : 'Mis bloqueos'}</h1>
        <AccionPrincipal href="/bloqueos/nuevo" etiqueta="Bloquear horas" Icono={CalendarPlus} />
      </div>
      <p className="mb-4 text-sm text-suave">Almuerzos, permisos y cierres de los próximos {DIAS} días. En esas horas no se pueden agendar citas.</p>

      {bloqueos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-borde bg-superficie px-6 py-10 text-center text-suave">
          <CalendarOff aria-hidden className="size-8" />
          <p>No hay bloqueos próximos.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {bloqueos.map((b) => {
            const cruzadas = citasQueSeCruzan(b, citas);
            const quien = b.profesionalId === null ? 'Todo el negocio' : esDueno ? (nombreDe.get(b.profesionalId) ?? 'Barbero') : null;
            // Un cierre del negocio lo ve el barbero, pero solo el dueño lo quita.
            const puedeQuitar = esDueno || b.profesionalId !== null;
            return (
              <li key={b.id} className="rounded-xl border border-borde bg-superficie p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium first-letter:uppercase">{describirBloqueo(b, zona)}</p>
                    <p className="text-sm text-suave">{[quien, b.motivo].filter(Boolean).join(' · ') || 'Sin motivo'}</p>
                  </div>
                  {puedeQuitar && <QuitarBloqueo bloqueoId={b.id} />}
                </div>
                {cruzadas.length > 0 && (
                  <div className="mt-2 rounded-lg bg-aviso-suave p-2 text-sm text-aviso">
                    <p className="flex items-center gap-1.5 font-semibold">
                      <TriangleAlert aria-hidden className="size-4" />
                      {cruzadas.length === 1 ? '1 cita se cruza' : `${cruzadas.length} citas se cruzan`}
                    </p>
                    <ul className="mt-1">
                      {cruzadas.map((c) => (
                        <li key={c.id}>
                          <Link href={`/citas/${c.id}`} className="underline underline-offset-2">
                            {horaLocal(c.inicio, zona)} · {c.clienteNombre ?? 'Cliente sin nombre'}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
