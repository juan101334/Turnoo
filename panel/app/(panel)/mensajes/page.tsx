import { ChevronRight, MessageSquare } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { RefrescoAutomatico } from '@/componentes/refresco-automatico';
import { telefonoLegible } from '@/lib/citas';
import { MOTIVOS, nombreDelCliente } from '@/lib/conversaciones';
import { conversaciones as leerConversaciones, MAX_CONVERSACIONES } from '@/lib/datos';
import { diaRelativo, fechaDe, fechaLarga, horaLocal, hoyEn } from '@/lib/fechas';
import { SECCIONES } from '@/lib/navegacion';
import { exigirUsuario } from '@/lib/sesion';

export const metadata: Metadata = { title: SECCIONES.mensajes.etiqueta };

/**
 * Conversaciones de WhatsApp. Por defecto, las que el asistente pasó a una persona; ?ver=todas
 * muestra también las que atiende el asistente. La más reciente arriba.
 */
export default async function PaginaMensajes({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const usuario = await exigirUsuario('mensajes');
  const zona = usuario.negocio.zonaHoraria;
  const todas = (await searchParams).ver === 'todas';
  const lista = await leerConversaciones(todas ? undefined : 'humano');
  const hoy = hoyEn(zona);
  const cuando = (iso: string) => {
    const fecha = fechaDe(iso, zona);
    return `${diaRelativo(fecha, hoy) ?? fechaLarga(fecha)}, ${horaLocal(iso, zona)}`;
  };

  const pestana = (activa: boolean) =>
    `flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-semibold transition-colors duration-150 ${activa ? 'bg-superficie text-texto shadow-sm' : 'text-suave hover:text-texto'}`;

  return (
    <div className="mx-auto max-w-2xl">
      <RefrescoAutomatico />
      <h1 className="text-2xl font-semibold">Mensajes</h1>
      <p className="mb-4 text-sm text-suave">Clientes de WhatsApp que el asistente pasó a una persona del negocio. Respóndeles desde aquí.</p>

      <nav aria-label="Filtro de conversaciones" className="mb-4 flex gap-1 rounded-xl bg-fondo p-1 ring-1 ring-borde">
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
        <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie">
          {lista.map((c) => (
            <li key={c.id}>
              <Link href={`/mensajes/${c.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-fondo">
                <span className="min-w-0 flex-1">
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
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-suave" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {lista.length === MAX_CONVERSACIONES && <p className="mt-4 text-center text-xs text-suave">Se muestran las {MAX_CONVERSACIONES} más recientes.</p>}
    </div>
  );
}
