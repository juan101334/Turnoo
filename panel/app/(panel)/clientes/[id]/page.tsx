import { ChevronLeft, MessageCircle, Pencil, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Aviso } from '@/componentes/aviso';
import { telefonoLegible } from '@/lib/citas';
import { cliente as leerCliente } from '@/lib/datos';
import { fechaDe, fechaLarga } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';
import { AnonimizarCliente } from './anonimizar';

export const metadata: Metadata = { title: 'Cliente' };

const LISTO: Record<string, string> = {
  editado: 'Cambios guardados.',
  anonimizado: 'Se borraron los datos del cliente.',
};

export default async function PaginaCliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ listo?: string }> }) {
  const usuario = await exigirUsuario('clientes');
  const { id } = await params;
  const { listo } = await searchParams;
  const c = await leerCliente(id);
  const zona = usuario.negocio.zonaHoraria;
  const esDueno = usuario.rol === 'dueno';
  const mensaje = listo ? LISTO[listo] : undefined;

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/clientes" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca">
        <ChevronLeft aria-hidden className="size-5" />
        Clientes
      </Link>

      {mensaje && (
        <div className="mb-3">
          <Aviso tipo="exito">{mensaje}</Aviso>
        </div>
      )}

      {c.anonimizadoEn ? (
        <>
          <h1 className="mb-3 text-2xl font-semibold">Cliente anonimizado</h1>
          <Aviso tipo="info">Sus datos personales se borraron a pedido suyo. Sus citas se conservan sin nombre ni teléfono.</Aviso>
        </>
      ) : (
        <>
        <section className="rounded-2xl border border-borde bg-superficie p-4">
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
          <p className="mb-4 text-sm text-suave">Cliente desde el {fechaLarga(fechaDe(c.createdAt, zona))}</p>

          {c.telefono && (
            <>
              <p className="mb-2 text-lg tabular-nums">{telefonoLegible(c.telefono)}</p>
              <div className="mb-4 grid grid-cols-2 gap-2">
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
              </div>
            </>
          )}

          {c.notas && (
            <div className="mb-4">
              <h2 className="text-sm text-suave">Notas</h2>
              <p className="whitespace-pre-line">{c.notas}</p>
            </div>
          )}
        </section>
        {esDueno && <AnonimizarCliente clienteId={c.id} />}
        </>
      )}
    </div>
  );
}
