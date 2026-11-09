import { CalendarPlus, ChevronRight, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BuscadorEnVivo } from '@/componentes/buscador-en-vivo';
import { telefonoLegible } from '@/lib/citas';
import { clientes as leerClientes } from '@/lib/datos';
import { fechaCorta, fechaDe } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Clientes' };

/** Búsqueda por nombre o teléfono mientras se escribe (sin tildes ni mayúsculas), de 30 en 30. El barbero ve solo los clientes con citas suyas. */
export default async function PaginaClientes({ searchParams }: { searchParams: Promise<{ buscar?: string; pagina?: string }> }) {
  const usuario = await exigirUsuario('clientes');
  const zona = usuario.negocio.zonaHoraria;
  const p = await searchParams;
  const buscar = (p.buscar ?? '').trim().slice(0, 100);
  const pagina = Math.max(0, Math.min(1000, Number.parseInt(p.pagina ?? '0', 10) || 0));
  const { clientes, hayMas } = await leerClientes(buscar, pagina);
  const enlace = (n: number) => `/clientes?${new URLSearchParams({ ...(buscar && { buscar }), pagina: String(n) })}`;

  return (
    <div className="mx-auto max-w-2xl lg:max-w-5xl">
      <h1 className="text-2xl font-semibold">{usuario.rol === 'dueno' ? 'Clientes' : 'Mis clientes'}</h1>
      <p className="mb-4 text-sm text-suave">
        {usuario.rol === 'dueno' ? 'Todos los clientes del negocio.' : 'Los clientes que tienen o tuvieron cita contigo.'}
      </p>

      <BuscadorEnVivo id="buscar" etiqueta="Buscar por nombre o teléfono" placeholder="Nombre o teléfono" inicial={buscar} className="mb-4 lg:max-w-xl" />

      {clientes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-borde bg-superficie px-6 py-10 text-center text-suave">
          <Users aria-hidden className="size-8" />
          <p>{buscar ? `Ningún cliente coincide con "${buscar}".` : 'Todavía no hay clientes.'}</p>
        </div>
      ) : (
        <>
        {/* En el escritorio, tabla: se compara de un vistazo. */}
        <table className="hidden w-full overflow-hidden rounded-xl border border-borde bg-superficie text-left lg:table">
          <thead className="border-b border-borde bg-hundido text-sm text-suave">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Nombre</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Teléfono</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Cliente desde</th>
              <th scope="col" className="px-4 py-2.5"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {clientes.map((c) => (
              <tr key={c.id} className="transition-colors duration-150 hover:bg-fondo">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/clientes/${c.id}`} className="hover:text-marca hover:underline">
                    {c.anonimizadoEn ? 'Cliente anonimizado' : (c.nombre ?? 'Sin nombre')}
                  </Link>
                </td>
                <td className="px-4 py-3 text-suave tabular-nums">{c.telefono ? telefonoLegible(c.telefono) : 'Sin teléfono'}</td>
                <td className="px-4 py-3 text-suave first-letter:uppercase">{fechaCorta(fechaDe(c.createdAt, zona))}</td>
                <td className="px-4 py-3 text-right">
                  {!c.anonimizadoEn && c.telefono && (
                    <Link href={`/citas/nueva?cliente=${c.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-marca hover:bg-marca-suave">
                      <CalendarPlus aria-hidden className="size-4" />
                      Agendar
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie lg:hidden">
          {clientes.map((c) => (
            <li key={c.id}>
              <Link href={`/clientes/${c.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors duration-150 hover:bg-fondo">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.anonimizadoEn ? 'Cliente anonimizado' : (c.nombre ?? 'Sin nombre')}</span>
                  <span className="block text-sm text-suave tabular-nums">{c.telefono ? telefonoLegible(c.telefono) : 'Sin teléfono'}</span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-suave" />
              </Link>
            </li>
          ))}
        </ul>
        </>
      )}

      {(pagina > 0 || hayMas) && (
        <nav aria-label="Páginas" className="mt-4 grid grid-cols-2 gap-2">
          {pagina > 0 ? (
            <Link href={enlace(pagina - 1)} className="flex min-h-11 items-center justify-center rounded-lg border border-borde bg-superficie font-medium hover:bg-fondo">
              Anteriores
            </Link>
          ) : (
            <span />
          )}
          {hayMas && (
            <Link href={enlace(pagina + 1)} className="flex min-h-11 items-center justify-center rounded-lg border border-borde bg-superficie font-medium hover:bg-fondo">
              Siguientes
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
