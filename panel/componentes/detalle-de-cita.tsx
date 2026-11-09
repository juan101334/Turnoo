import { MessageCircle, Phone } from 'lucide-react';
import { InsigniaEstado } from '@/componentes/estado-cita';
import { duracionLegible, duracionMinutos } from '@/lib/agenda';
import { pesos, telefonoLegible, type Cita } from '@/lib/citas';
import { fechaDe, fechaLarga, horaLocal, tiempoRestante } from '@/lib/fechas';

/**
 * Lo que se sabe de una cita: hora, cliente, servicios, total y cómo contactar al cliente.
 * Lo usan la página de la cita (celular) y el panel lateral de la agenda (escritorio).
 */
export function DetalleDeCita({ cita, zona, nivel = 1, idTitulo }: { cita: Cita; zona: string; nivel?: 1 | 2; idTitulo?: string }) {
  const fecha = fechaDe(cita.inicio, zona);
  const Titulo = nivel === 1 ? 'h1' : 'h2';
  return (
    <section className="rounded-xl border border-borde bg-superficie p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <Titulo id={idTitulo} tabIndex={-1} className="cifras text-3xl font-semibold outline-none">
            {horaLocal(cita.inicio, zona)}
          </Titulo>
          <p className="text-suave first-letter:uppercase">
            {fechaLarga(fecha)} · hasta {horaLocal(cita.fin, zona)} · {duracionLegible(duracionMinutos(cita))}
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
  );
}
