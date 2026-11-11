import { ArrowDown, ArrowUp, ArrowUpDown, CalendarPlus, ChevronRight, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BuscadorEnVivo } from '@/componentes/buscador-en-vivo';
import { telefonoLegible } from '@/lib/citas';
import { clientes as leerClientes } from '@/lib/datos';
import { diaRelativo, fechaCorta, fechaDe, horaLocal, hoyEn } from '@/lib/fechas';
import { ariaSort, enlaceDeClientes, leerOrden, nombreEnLista, siguienteOrden, type ColumnaOrdenable, type Orden } from '@/lib/lista-de-clientes';
import { exigirUsuario } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Clientes' };

/**
 * Búsqueda por nombre o teléfono mientras se escribe (sin tildes ni mayúsculas), de 30 en 30. El
 * barbero ve solo los clientes con citas suyas. En el escritorio, tabla ordenable por columna
 * (?orden=&direccion=; ordena el backend, así el orden vale para todas las páginas).
 */
export default async function PaginaClientes({
  searchParams,
}: {
  searchParams: Promise<{ buscar?: string; pagina?: string; orden?: string; direccion?: string }>;
}) {
  const usuario = await exigirUsuario('clientes');
  const zona = usuario.negocio.zonaHoraria;
  const hoy = hoyEn(zona);
  const p = await searchParams;
  const buscar = (p.buscar ?? '').trim().slice(0, 100);
  const pagina = Math.max(0, Math.min(1000, Number.parseInt(p.pagina ?? '0', 10) || 0));
  const orden = leerOrden(p);
  const { clientes, hayMas } = await leerClientes(buscar, pagina, orden);
  const enlace = (n: number) => enlaceDeClientes({ buscar, orden, pagina: n });
  const dia = (iso: string) => fechaCorta(fechaDe(iso, zona));
  /** 'Mañana · 3:30 p. m.' o '17 nov 2026 · 10:00 a. m.'. */
  const proxima = (iso: string) => `${diaRelativo(fechaDe(iso, zona), hoy) ?? dia(iso)} · ${horaLocal(iso, zona)}`;
  const encabezado = (columna: ColumnaOrdenable, titulo: string, alDerecha = false) => (
    <Encabezado columna={columna} titulo={titulo} orden={orden} enlace={enlaceDeClientes({ buscar, orden: siguienteOrden(orden, columna) })} alDerecha={alDerecha} />
  );

  return (
    <div className="ancho-lista">
      <h1 className="text-2xl font-semibold">{usuario.rol === 'dueno' ? 'Clientes' : 'Mis clientes'}</h1>
      <p className="mb-4 text-sm text-suave">
        {usuario.rol === 'dueno' ? 'Todos los clientes del negocio.' : 'Los clientes que tienen o tuvieron cita contigo.'}
      </p>

      <BuscadorEnVivo id="buscar" etiqueta="Buscar por nombre o teléfono" placeholder="Nombre o teléfono" inicial={buscar} className="mb-4 lg:max-w-xl">
        {p.orden && <input type="hidden" name="orden" value={orden.orden} />}
        {p.orden && <input type="hidden" name="direccion" value={orden.direccion} />}
      </BuscadorEnVivo>

      {clientes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-borde bg-superficie px-6 py-10 text-center text-suave">
          <Users aria-hidden className="size-8" />
          <p>{buscar ? `Ningún cliente coincide con "${buscar}".` : 'Todavía no hay clientes.'}</p>
        </div>
      ) : (
        <>
        {/* En el escritorio, tabla: se compara de un vistazo y se ordena por columna. */}
        <table className="hidden w-full overflow-hidden rounded-xl border border-borde bg-superficie text-left lg:table">
          <thead className="border-b border-borde bg-hundido text-sm text-suave">
            <tr>
              {encabezado('nombre', 'Nombre')}
              <th scope="col" className="px-4 py-2.5 font-medium">Teléfono</th>
              {encabezado('ultima_visita', 'Última visita')}
              {encabezado('proxima_cita', 'Próxima cita')}
              {encabezado('total_citas', 'Nº de citas', true)}
              <th scope="col" className="px-4 py-2.5"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {clientes.map((c) => {
              const nombre = nombreEnLista(c);
              return (
                <tr key={c.id} className="transition-colors duration-150 hover:bg-fondo">
                  <td className="px-4 py-3">
                    <Link href={`/clientes/${c.id}`} className={`font-medium hover:text-marca hover:underline ${c.nombre ? 'break-words' : 'tabular-nums'}`}>
                      {nombre.principal}
                    </Link>
                    {!c.nombre && !c.anonimizadoEn && c.telefono && <span className="block text-sm text-suave">Sin nombre</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-suave tabular-nums">{c.telefono ? telefonoLegible(c.telefono) : 'Sin teléfono'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-suave first-letter:uppercase">{c.ultimaVisita ? dia(c.ultimaVisita) : <Ninguna />}</td>
                  <td className="px-4 py-3 whitespace-nowrap first-letter:uppercase">{c.proximaCita ? proxima(c.proximaCita) : <Ninguna />}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.totalCitas}</td>
                  <td className="px-4 py-3 text-right">
                    {!c.anonimizadoEn && c.telefono && (
                      <Link href={`/citas/nueva?cliente=${c.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold whitespace-nowrap text-marca hover:bg-marca-suave">
                        <CalendarPlus aria-hidden className="size-4" />
                        Agendar
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie lg:hidden">
          {clientes.map((c) => {
            const nombre = nombreEnLista(c);
            return (
              <li key={c.id}>
                <Link href={`/clientes/${c.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors duration-150 hover:bg-fondo">
                  <span className="min-w-0 flex-1">
                    <span className={`block font-medium break-words ${c.nombre ? '' : 'tabular-nums'}`}>{nombre.principal}</span>
                    <span className={`block text-sm text-suave ${c.nombre ? 'tabular-nums' : ''}`}>{nombre.detalle}</span>
                    {c.proximaCita && <span className="block text-sm text-suave">Próxima cita: {proxima(c.proximaCita)}</span>}
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-suave" />
                </Link>
              </li>
            );
          })}
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

/** Encabezado que ordena: un enlace (funciona sin JavaScript) y aria-sort con el orden actual. */
function Encabezado({ columna, titulo, orden, enlace, alDerecha }: { columna: ColumnaOrdenable; titulo: string; orden: Orden; enlace: string; alDerecha: boolean }) {
  const sort = ariaSort(orden, columna);
  const Icono = sort === 'ascending' ? ArrowUp : sort === 'descending' ? ArrowDown : ArrowUpDown;
  return (
    <th scope="col" aria-sort={sort} className={`px-2 py-1 font-medium ${alDerecha ? 'text-right' : ''}`}>
      <Link
        href={enlace}
        scroll={false}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 whitespace-nowrap transition-colors duration-150 hover:bg-superficie hover:text-texto ${sort === 'none' ? '' : 'text-texto'}`}
      >
        {titulo}
        <Icono aria-hidden className={`size-4 ${sort === 'none' ? 'opacity-50' : ''}`} />
      </Link>
    </th>
  );
}

/** Celda vacía: una raya a la vista y "Ninguna" para el lector de pantalla. */
function Ninguna() {
  return (
    <>
      <span aria-hidden className="text-suave">—</span>
      <span className="sr-only">Ninguna</span>
    </>
  );
}
