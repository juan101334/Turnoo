import { MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { telefonoLegible } from '@/lib/citas';
import { MOTIVOS, nombreDelCliente, type Conversacion } from '@/lib/conversaciones';
import { MAX_CONVERSACIONES } from '@/lib/datos';
import { diaRelativo, fechaDe, fechaLarga, horaLocal, hoyEn } from '@/lib/fechas';

/**
 * Lista de conversaciones con el filtro "Esperan a una persona / Todas". En el celular es la
 * pantalla de Mensajes; en el escritorio va a la izquierda de la conversación abierta, que queda
 * marcada. El filtro viaja en la URL (?ver=todas) también al abrir una conversación.
 */
export function ListaDeConversaciones({
  lista,
  zona,
  todas,
  abierta,
}: {
  lista: Conversacion[];
  zona: string;
  todas: boolean;
  abierta?: string;
}) {
  const hoy = hoyEn(zona);
  const cuando = (iso: string) => {
    const fecha = fechaDe(iso, zona);
    const dia = diaRelativo(fecha, hoy);
    return dia === 'Hoy' ? horaLocal(iso, zona) : (dia ?? fechaLarga(fecha).replace(/^\S+ /, ''));
  };
  const sufijo = todas ? '?ver=todas' : '';
  const pestana = (activa: boolean) =>
    `flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-semibold transition-colors duration-150 ${activa ? 'bg-superficie text-texto shadow-sm' : 'text-suave hover:text-texto'}`;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <nav aria-label="Filtro de conversaciones" className="flex gap-1 rounded-xl bg-fondo p-1 ring-1 ring-borde">
        <Link href="/mensajes" aria-current={todas ? undefined : 'page'} className={pestana(!todas)}>
          Esperan a una persona
        </Link>
        <Link href="/mensajes?ver=todas" aria-current={todas ? 'page' : undefined} className={pestana(todas)}>
          Todas
        </Link>
      </nav>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-borde bg-superficie px-6 py-10 text-center text-suave">
          <MessageSquare aria-hidden className="size-8" />
          <p>{todas ? 'Todavía no hay conversaciones.' : 'Ningún cliente está esperando a una persona.'}</p>
        </div>
      ) : (
        <ul aria-label="Conversaciones" className="min-h-0 divide-y divide-borde overflow-y-auto rounded-xl border border-borde bg-superficie">
          {lista.map((c) => {
            const elegida = c.id === abierta;
            return (
              <li key={c.id}>
                <Link
                  href={`/mensajes/${c.id}${sufijo}`}
                  aria-current={elegida ? 'page' : undefined}
                  className={`flex min-h-16 flex-col justify-center gap-0.5 px-4 py-3 transition-colors duration-150 ${elegida ? 'bg-marca-suave' : 'hover:bg-fondo'}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{nombreDelCliente(c.cliente, telefonoLegible)}</span>
                    {c.ultimoMensajeEn && <span className="shrink-0 text-xs text-suave first-letter:uppercase">{cuando(c.ultimoMensajeEn)}</span>}
                  </span>
                  {c.estado === 'humano' && c.ultimaDerivacion ? (
                    <>
                      <span className="block truncate text-sm text-aviso">{MOTIVOS[c.ultimaDerivacion.motivo] ?? 'Necesita a una persona'}</span>
                      {c.ultimaDerivacion.detalle && <span className="block truncate text-sm text-suave">{c.ultimaDerivacion.detalle}</span>}
                    </>
                  ) : (
                    <span className="block text-sm text-suave">{c.estado === 'humano' ? 'La atiende el negocio' : 'La atiende el asistente'}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {lista.length === MAX_CONVERSACIONES && <p className="text-center text-xs text-suave">Se muestran las {MAX_CONVERSACIONES} más recientes.</p>}
    </div>
  );
}
