import { Building2, ChevronRight, MessageCircle, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BuscadorEnVivo } from '@/componentes/buscador-en-vivo';
import { fechaCorta, fechaDe } from '@/lib/fechas';
import type { EstadoNegocio } from '@/lib/plan';
import { negocios as leerNegocios } from '@/lib/superadmin';
import { EstadoDeNegocio } from './estado-de-negocio';

export const metadata: Metadata = { title: 'Negocios · Superadmin' };

const ZONA = 'America/Bogota';

type Parametros = { buscar?: string; estado?: string; whatsapp?: string };

const ESTADOS: { valor: EstadoNegocio; etiqueta: string }[] = [
  { valor: 'activo', etiqueta: 'Activo' },
  { valor: 'prueba', etiqueta: 'En prueba' },
  { valor: 'suspendido', etiqueta: 'Suspendido' },
];
const WHATSAPP = [
  { valor: 'si', etiqueta: 'Con WhatsApp' },
  { valor: 'no', etiqueta: 'Sin WhatsApp' },
] as const;

/** Sin tildes ni mayúsculas: "barberia rapida" encuentra "Barbería Rápida". */
const normal = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Todos los negocios, el más nuevo primero. Búsqueda por nombre mientras se escribe (?buscar=) y
 * filtros por estado (?estado=) y por WhatsApp conectado (?whatsapp=si|no). Se filtra aquí: el
 * backend devuelve la lista completa, que es corta (uno por barbería cliente).
 */
export default async function PaginaSuperadmin({ searchParams }: { searchParams: Promise<Parametros> }) {
  const p = await searchParams;
  const buscar = (p.buscar ?? '').trim().slice(0, 100);
  const estado = ESTADOS.find((e) => e.valor === p.estado)?.valor;
  const whatsapp = WHATSAPP.find((w) => w.valor === p.whatsapp)?.valor;
  const todos = await leerNegocios();
  const lista = todos.filter(
    (n) =>
      (!buscar || normal(n.nombre).includes(normal(buscar))) &&
      (!estado || n.estado === estado) &&
      (!whatsapp || n.whatsappConectado === (whatsapp === 'si')),
  );
  const cuenta = (e: string) => todos.filter((n) => n.estado === e).length;
  const filtrando = Boolean(buscar || estado || whatsapp);

  /** La URL con un filtro cambiado (o quitado con undefined), conservando lo demás. */
  const enlace = (cambio: Partial<Record<'estado' | 'whatsapp', string | undefined>>) => {
    const q = new URLSearchParams();
    if (buscar) q.set('buscar', buscar);
    const e = 'estado' in cambio ? cambio.estado : estado;
    const w = 'whatsapp' in cambio ? cambio.whatsapp : whatsapp;
    if (e) q.set('estado', e);
    if (w) q.set('whatsapp', w);
    return q.size > 0 ? `/superadmin?${q}` : '/superadmin';
  };

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

      <div className="mb-4 flex flex-col gap-3">
        <BuscadorEnVivo id="buscar" etiqueta="Buscar negocio por nombre" placeholder="Nombre del negocio" inicial={buscar} className="sm:max-w-md">
          {estado && <input type="hidden" name="estado" value={estado} />}
          {whatsapp && <input type="hidden" name="whatsapp" value={whatsapp} />}
        </BuscadorEnVivo>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-2">
          <Filtro titulo="Estado" opciones={ESTADOS} actual={estado} enlace={(v) => enlace({ estado: v })} />
          <Filtro titulo="WhatsApp" opciones={WHATSAPP} actual={whatsapp} enlace={(v) => enlace({ whatsapp: v })} />
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-borde bg-superficie px-6 py-10 text-center text-suave">
          <Building2 aria-hidden className="size-8" />
          <p>{filtrando ? 'Ningún negocio coincide con la búsqueda y los filtros.' : 'Todavía no hay negocios.'}</p>
          {filtrando && (
            <Link href="/superadmin" className="flex min-h-11 items-center rounded-lg px-3 font-semibold text-marca hover:bg-marca-suave">
              Ver todos
            </Link>
          )}
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
                    {!n.whatsappConectado && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-hundido px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-suave">
                        <MessageCircle aria-hidden className="size-3.5" />
                        Sin WhatsApp
                      </span>
                    )}
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

/** Un grupo de filtros como pastillas: "Todos" y una por opción. La activa lleva aria-current. */
function Filtro<V extends string>({
  titulo,
  opciones,
  actual,
  enlace,
}: {
  titulo: string;
  opciones: readonly { valor: V; etiqueta: string }[];
  actual: V | undefined;
  enlace: (valor: V | undefined) => string;
}) {
  const clase = (activa: boolean) =>
    `flex min-h-11 items-center rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
      activa ? 'border-marca bg-marca text-white' : 'border-borde bg-superficie hover:bg-hundido'
    }`;
  return (
    <nav aria-label={`Filtrar por ${titulo.toLowerCase()}`} className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-1.5">
      <span className="text-sm text-suave sm:mr-1">{titulo}</span>
      {/* En el celular, una sola fila que se desliza: así ninguna pastilla queda sola abajo. */}
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      <Link href={enlace(undefined)} aria-current={actual === undefined ? 'true' : undefined} className={clase(actual === undefined)}>
        Todos
      </Link>
      {opciones.map((o) => (
        <Link key={o.valor} href={enlace(o.valor)} aria-current={actual === o.valor ? 'true' : undefined} className={clase(actual === o.valor)}>
          {o.etiqueta}
        </Link>
      ))}
      </div>
    </nav>
  );
}
