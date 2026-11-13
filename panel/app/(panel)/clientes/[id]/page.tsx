import { CalendarPlus, ChevronLeft, MessageCircle, Pencil, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AvisoDeLaUrl } from '@/componentes/aviso-de-la-url';
import { Aviso } from '@/componentes/aviso';
import { HistorialDeCitas } from '@/componentes/historial-de-citas';
import { telefonoLegible } from '@/lib/citas';
import { cliente as leerCliente, historialDe } from '@/lib/datos';
import { fechaDe, fechaLarga } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';
import { AnonimizarCliente } from './anonimizar';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await exigirUsuario('clientes');
  const c = await leerCliente((await params).id);
  return { title: c.anonimizadoEn ? 'Cliente anonimizado' : (c.nombre ?? 'Cliente sin nombre') };
}

const LISTO: Record<string, string> = {
  editado: 'Cambios guardados.',
  anonimizado: 'Se borraron los datos del cliente.',
};

/**
 * Ficha del cliente: sus datos y su historial de citas. En el escritorio, en dos columnas.
 */
export default async function PaginaCliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ listo?: string; pagina?: string }> }) {
  const usuario = await exigirUsuario('clientes');
  const { id } = await params;
  const { listo, pagina: textoPagina } = await searchParams;
  const pagina = Math.max(0, Math.min(1000, Number.parseInt(textoPagina ?? '0', 10) || 0));
  const [c, historial] = await Promise.all([leerCliente(id), historialDe(id, pagina)]);
  const zona = usuario.negocio.zonaHoraria;
  const esDueno = usuario.rol === 'dueno';
  const mensaje = listo ? LISTO[listo] : undefined;

  return (
    <div className="ancho-lista">
      <Link href="/clientes" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca">
        <ChevronLeft aria-hidden className="size-5" />
        Clientes
      </Link>

      <AvisoDeLaUrl mensaje={mensaje} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          {c.anonimizadoEn ? (
            <>
              <h1 className="mb-3 text-2xl font-semibold">Cliente anonimizado</h1>
              <Aviso tipo="info">Sus datos personales se borraron a pedido suyo. Sus citas se conservan sin nombre ni teléfono.</Aviso>
            </>
          ) : (
            <>
            <section className="flex flex-col gap-3 rounded-xl border border-borde bg-superficie p-4">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <h1 className="min-w-0 text-2xl font-semibold break-words">{c.nombre ?? 'Sin nombre'}</h1>
                  {esDueno && (
                    <Link
                      href={`/clientes/${c.id}/editar`}
                      className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-borde px-3 text-sm font-medium hover:bg-fondo"
                    >
                      <Pencil aria-hidden className="size-4" />
                      Editar
                    </Link>
                  )}
                </div>
                {c.telefono && <p className="text-lg tabular-nums">{telefonoLegible(c.telefono)}</p>}
                <p className="text-sm text-suave">Cliente desde el {fechaLarga(fechaDe(c.createdAt, zona))}</p>
              </div>

              {c.telefono && (
                <div className="grid grid-cols-2 gap-2">
                  <a href={`tel:+${c.telefono}`} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-borde font-medium hover:bg-fondo">
                    <Phone aria-hidden className="size-4" />
                    Llamar
                  </a>
                  <a
                    href={`https://wa.me/${c.telefono}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-borde font-medium hover:bg-fondo"
                  >
                    <MessageCircle aria-hidden className="size-4" />
                    WhatsApp
                  </a>
                  {/* Solo viaja el id: el teléfono lo busca el servidor de Nueva cita. */}
                  <Link
                    href={`/citas/nueva?cliente=${c.id}`}
                    className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-marca font-semibold text-white hover:bg-marca-oscura"
                  >
                    <CalendarPlus aria-hidden className="size-4" />
                    Agendar una cita
                  </Link>
                </div>
              )}

              {c.notas && (
                <div>
                  <h2 className="text-sm text-suave">Notas</h2>
                  <p className="whitespace-pre-line">{c.notas}</p>
                </div>
              )}
            </section>
            {esDueno && <AnonimizarCliente clienteId={c.id} />}
            </>
          )}
        </div>
        <HistorialDeCitas
          citas={historial.citas}
          hayMas={historial.hayMas}
          pagina={pagina}
          zona={zona}
          conBarbero={esDueno}
          enlace={(n) => (n === 0 ? `/clientes/${c.id}` : `/clientes/${c.id}?pagina=${n}`)}
        />
      </div>
    </div>
  );
}
