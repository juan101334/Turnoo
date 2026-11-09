import { Building2, ChevronRight, Plus, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fechaCorta, fechaDe } from '@/lib/fechas';
import { negocios as leerNegocios } from '@/lib/superadmin';
import { EstadoDeNegocio } from './estado-de-negocio';

export const metadata: Metadata = { title: 'Negocios · Superadmin' };

const ZONA = 'America/Bogota';

/** Todos los negocios, el más nuevo primero, con búsqueda por nombre (?buscar=). */
export default async function PaginaSuperadmin({ searchParams }: { searchParams: Promise<{ buscar?: string }> }) {
  const buscar = ((await searchParams).buscar ?? '').trim().slice(0, 100);
  const todos = await leerNegocios();
  const normal = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const lista = buscar ? todos.filter((n) => normal(n.nombre).includes(normal(buscar))) : todos;
  const cuenta = (estado: string) => todos.filter((n) => n.estado === estado).length;

  return (
    <div>
      <div className="mb-1 flex items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Negocios</h1>
        <Link href="/superadmin/negocios/nuevo" className="flex min-h-11 items-center gap-2 rounded-lg bg-marca px-4 font-semibold text-white hover:bg-marca-oscura">
          <Plus aria-hidden className="size-5" />
          Nuevo negocio
        </Link>
      </div>
      <p className="mb-4 text-sm text-suave tabular-nums">
        {todos.length} en total · {cuenta('activo')} {cuenta('activo') === 1 ? 'activo' : 'activos'} · {cuenta('prueba')} en prueba · {cuenta('suspendido')}{' '}
        {cuenta('suspendido') === 1 ? 'suspendido' : 'suspendidos'}
      </p>

      <form action="/superadmin" role="search" className="mb-4 flex gap-2 sm:max-w-md">
        <label htmlFor="buscar" className="sr-only">
          Buscar negocio por nombre
        </label>
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-suave" />
          <input id="buscar" name="buscar" type="search" defaultValue={buscar} placeholder="Nombre del negocio" maxLength={100} autoComplete="off" className="min-h-11 w-full rounded-lg border border-borde bg-superficie pr-3 pl-10 text-base" />
        </div>
        <button type="submit" className="min-h-11 cursor-pointer rounded-lg border border-borde bg-superficie px-4 font-semibold hover:bg-fondo">
          Buscar
        </button>
      </form>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-borde bg-superficie px-6 py-10 text-center text-suave">
          <Building2 aria-hidden className="size-8" />
          <p>{buscar ? `Ningún negocio se llama así ("${buscar}").` : 'Todavía no hay negocios.'}</p>
        </div>
      ) : (
        <ul aria-label="Negocios" className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie">
          {lista.map((n) => (
            <li key={n.id}>
              <Link href={`/superadmin/negocios/${n.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-fondo">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-medium">{n.nombre}</span>
                    <EstadoDeNegocio estado={n.estado} />
                  </span>
                  <span className="block text-sm text-suave">
                    Desde el {fechaCorta(fechaDe(n.createdAt, ZONA))}
                    {n.estado === 'prueba' && n.pruebaHasta && ` · prueba hasta el ${fechaCorta(fechaDe(n.pruebaHasta, ZONA))}`} · {n.zonaHoraria.replaceAll('_', ' ')}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-suave" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
