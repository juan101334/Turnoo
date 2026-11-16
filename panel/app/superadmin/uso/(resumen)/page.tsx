import { ArrowDown, ArrowUp, ArrowUpDown, Banknote, Bot, CalendarCheck, CalendarX, ChevronRight, CircleCheck, Coins, Hourglass, Mic, Send, TrendingUp, type LucideIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { pesos } from '@/lib/citas';
import {
  cantidad,
  haceDias,
  leerOrden,
  leerSerie,
  mesElegido,
  minutosDeAudio,
  ordenar,
  ORDEN_INICIAL,
  porcentaje,
  siguienteOrden,
  tokens,
  ZONA_DEL_PANEL,
  type Alertas,
  type Columna,
  type ConsumoDeNegocio,
  type Orden,
  type Serie,
} from '@/lib/consumo';
import { fechaCorta, fechaDe, fechaLarga } from '@/lib/fechas';
import { UMBRAL_AVISO } from '@/lib/plan';
import { exigirSuperadmin } from '@/lib/sesion-superadmin';
import { consumoPorNegocio, resumenDeConsumo } from '@/lib/superadmin';
import { EstadoDeNegocio } from '../../estado-de-negocio';
import { Cifra, GraficoDiario, SelectorDeMes } from '../piezas';

export const metadata: Metadata = { title: 'Uso · Superadmin' };

type Parametros = { mes?: string; ver?: string; orden?: string; dir?: string };

/** Color del porcentaje del plan: igual que la pantalla Plan del dueño. */
const nivelDeIa = (p: number | null) => (p === null || p < UMBRAL_AVISO ? '' : p >= 100 ? 'text-peligro' : 'text-aviso');

/**
 * Uso de la plataforma en un mes (?mes=AAAA-MM): totales, lo que pide atención hoy, la tendencia
 * diaria (?ver=) y la tabla por negocio, que se ordena aquí (?orden=&dir=) porque es corta: un
 * negocio por barbería cliente. Solo agregados: nunca mensajes ni datos de los clientes finales.
 */
export default async function PaginaUso({ searchParams }: { searchParams: Promise<Parametros> }) {
  await exigirSuperadmin();
  const p = await searchParams;
  const mes = mesElegido(p.mes);
  const serie = leerSerie(p.ver);
  const orden = leerOrden(p);
  const [resumen, negocios] = await Promise.all([resumenDeConsumo(mes), consumoPorNegocio(mes)]);
  const { uso, costo, negocios: cuantos } = resumen;
  const lista = ordenar(negocios, orden);

  /** La URL con algo cambiado, conservando lo demás y sin lo que ya es lo de siempre. */
  const enlace = (cambio: { mes?: string; serie?: Serie; orden?: Orden } = {}) => {
    const q = new URLSearchParams();
    const m = cambio.mes ?? mes;
    const s = cambio.serie ?? serie;
    const o = cambio.orden ?? orden;
    if (m !== mesElegido(undefined)) q.set('mes', m);
    if (s !== 'ia') q.set('ver', s);
    if (o.columna !== ORDEN_INICIAL.columna || o.direccion !== ORDEN_INICIAL.direccion) {
      q.set('orden', o.columna);
      q.set('dir', o.direccion);
    }
    return q.size > 0 ? `/superadmin/uso?${q}` : '/superadmin/uso';
  };
  const detalle = (negocioId: string) => (mes === mesElegido(undefined) ? `/superadmin/uso/${negocioId}` : `/superadmin/uso/${negocioId}?mes=${mes}`);
  const encabezado = (columna: Columna, titulo: string, alDerecha = true) => (
    <Encabezado columna={columna} titulo={titulo} orden={orden} enlace={enlace({ orden: siguienteOrden(orden, columna) })} alDerecha={alDerecha} />
  );

  return (
    <div>
      <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Uso</h1>
        <SelectorDeMes mes={mes} enlace={(m) => enlace({ mes: m })} />
      </div>
      <p className="mb-4 text-sm text-suave tabular-nums">
        Hoy: {cuantos.activos} {cuantos.activos === 1 ? 'negocio activo' : 'negocios activos'} · {cuantos.enPrueba} en prueba · {cuantos.suspendidos}{' '}
        {cuantos.suspendidos === 1 ? 'suspendido' : 'suspendidos'}
      </p>

      <section aria-labelledby="totales" className="mb-4">
        <h2 id="totales" className="sr-only">
          Totales del mes
        </h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Cifra
          titulo="Ingreso mensual contratado"
          Icono={Banknote}
          valor={pesos(resumen.mrrContratadoCop)}
          detalle="Planes de los negocios activos hoy. Sin los que están en prueba."
        />
        <Cifra
          titulo="Conversaciones con el asistente"
          Icono={Bot}
          valor={cantidad(uso.conversacionesIa)}
          detalle={`${tokens(uso.tokensEntrada)} tokens de entrada · ${tokens(uso.tokensSalida)} de salida`}
        />
        <Cifra titulo="Citas del mes" Icono={CalendarCheck} valor={cantidad(uso.citas)} detalle="Por su fecha, en cualquier estado." />
        <Cifra titulo="Mensajes automáticos" Icono={Send} valor={cantidad(uso.plantillas)} detalle="Recordatorios y avisos al dueño." />
        <Cifra titulo="Audio transcrito" Icono={Mic} valor={minutosDeAudio(uso.segundosAudio)} detalle="Notas de voz de los clientes." />
        {costo ? (
          <Cifra
            titulo="Costo estimado"
            Icono={Coins}
            valor={pesos(costo.totalCop)}
            detalle={`Asistente ${pesos(costo.iaCop)} · audio ${pesos(costo.audioCop)} · mensajes ${pesos(costo.plantillasCop)}. Queda ${pesos(resumen.mrrContratadoCop - costo.totalCop)} del ingreso contratado.`}
          />
        ) : (
          <Cifra titulo="Costo estimado" Icono={Coins} valor="Sin tarifas" detalle="Faltan las tarifas en el servidor (variables TARIFA_*): por ahora solo hay unidades." />
        )}
        </dl>
      </section>

      <ListaDeAlertas alertas={resumen.alertas} detalle={detalle} />

      <div className="mb-4">
        <GraficoDiario mes={mes} dias={resumen.diario} serie={serie} enlaceDeSerie={(s) => enlace({ serie: s })} detalleDesde={resumen.detallePorDiaDesde} />
      </div>

      <section aria-labelledby="por-negocio">
        <h2 id="por-negocio" className="mb-2 font-semibold">
          Por negocio
        </h2>
        {lista.length === 0 ? (
          <p className="rounded-xl border border-dashed border-borde bg-superficie px-6 py-10 text-center text-suave">Todavía no hay negocios.</p>
        ) : (
          <>
            {/* En el escritorio, tabla: se compara de un vistazo y se ordena por columna. */}
            <table className="hidden w-full overflow-hidden rounded-xl border border-borde bg-superficie text-left lg:table">
              <thead className="border-b border-borde bg-hundido text-sm text-suave">
                <tr>
                  {encabezado('nombre', 'Negocio', false)}
                  {encabezado('ia', 'Asistente')}
                  {encabezado('citas', 'Citas')}
                  {encabezado('inasistencia', 'No asistió')}
                  {encabezado('mensajes', 'Mensajes')}
                  {encabezado('fallos', 'Fallos')}
                  {encabezado('inactividad', 'Actividad')}
                  {costo && encabezado('costo', 'Costo')}
                  {costo && encabezado('margen', 'Margen')}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {lista.map((n) => (
                  <tr key={n.negocioId} className="transition-colors duration-150 hover:bg-fondo">
                    <th scope="row" className="px-4 py-2 font-normal">
                      <Link href={detalle(n.negocioId)} className="font-medium break-words hover:text-marca hover:underline">
                        {n.nombre}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-suave">
                        <EstadoDeNegocio estado={n.estado} />
                        {n.plan ? n.plan.nombre : 'Sin plan'}
                      </span>
                    </th>
                    <td className="cifras px-4 py-2 text-right whitespace-nowrap">
                      <UsoDeIa n={n} />
                    </td>
                    <td className="cifras px-4 py-2 text-right">{cantidad(n.citas)}</td>
                    <td className="cifras px-4 py-2 text-right">{n.porcentajeNoAsistio === null ? <SinDato /> : porcentaje(n.porcentajeNoAsistio)}</td>
                    <td className="cifras px-4 py-2 text-right">{cantidad(n.plantillas)}</td>
                    <td className={`cifras px-4 py-2 text-right ${n.fallosDeEnvio > 0 ? 'font-semibold text-peligro' : ''}`}>{cantidad(n.fallosDeEnvio)}</td>
                    <td className="px-4 py-2 text-right text-sm whitespace-nowrap text-suave">{haceDias(n.diasSinActividad)}</td>
                    {costo && <td className="cifras px-4 py-2 text-right whitespace-nowrap">{n.costo ? pesos(n.costo.totalCop) : <SinDato />}</td>}
                    {costo && (
                      <td className={`cifras px-4 py-2 text-right whitespace-nowrap ${n.margenCop !== null && n.margenCop < 0 ? 'font-semibold text-peligro' : ''}`}>
                        {n.margenCop === null ? <SinDato /> : pesos(n.margenCop)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* En el celular y la tablet, tarjetas; el orden se elige con las pastillas. */}
            <nav aria-label="Ordenar negocios" className="-mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4 lg:hidden">
              {(
                [
                  ['nombre', 'Nombre'],
                  ['ia', 'Asistente'],
                  ['citas', 'Citas'],
                  ['fallos', 'Fallos'],
                  ['inactividad', 'Sin actividad'],
                ] as const
              ).map(([columna, titulo]) => (
                <Link
                  key={columna}
                  href={enlace({ orden: siguienteOrden(orden, columna) })}
                  scroll={false}
                  aria-current={orden.columna === columna ? 'true' : undefined}
                  className={`flex min-h-11 items-center gap-1 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
                    orden.columna === columna ? 'border-marca bg-marca text-white' : 'border-borde bg-superficie hover:bg-hundido'
                  }`}
                >
                  {titulo}
                  {orden.columna === columna && (
                    <>
                      {orden.direccion === 'asc' ? <ArrowUp aria-hidden className="size-4" /> : <ArrowDown aria-hidden className="size-4" />}
                      <span className="sr-only">{orden.direccion === 'asc' ? ', de menor a mayor' : ', de mayor a menor'}</span>
                    </>
                  )}
                </Link>
              ))}
            </nav>
            <ul aria-label="Negocios" className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie lg:hidden">
              {lista.map((n) => (
                <li key={n.negocioId}>
                  <Link href={detalle(n.negocioId)} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-fondo">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium break-words">{n.nombre}</span>
                        <EstadoDeNegocio estado={n.estado} />
                      </span>
                      <span className="block text-sm text-suave">
                        {n.plan ? n.plan.nombre : 'Sin plan'} · Asistente <UsoDeIa n={n} />
                      </span>
                      <span className="block text-sm text-suave">
                        {cantidad(n.citas)} {n.citas === 1 ? 'cita' : 'citas'} · {cantidad(n.plantillas)} {n.plantillas === 1 ? 'mensaje' : 'mensajes'}
                        {n.fallosDeEnvio > 0 && (
                          <span className="font-semibold text-peligro">
                            {' '}
                            · {cantidad(n.fallosDeEnvio)} {n.fallosDeEnvio === 1 ? 'fallo' : 'fallos'}
                          </span>
                        )}
                      </span>
                      <span className="block text-sm text-suave">
                        Última actividad: {haceDias(n.diasSinActividad).toLowerCase()}
                        {n.costo && ` · costo ${pesos(n.costo.totalCop)}`}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="size-5 shrink-0 text-suave" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

/** "250 de 300 · 83%", con el porcentaje en color desde el 80%; sin límite, solo la cuenta. */
function UsoDeIa({ n }: { n: ConsumoDeNegocio }) {
  const limite = n.plan?.maxConversacionesIa ?? null;
  if (limite === null || n.porcentajeIa === null) return <>{cantidad(n.conversacionesIa)}</>;
  return (
    <>
      {cantidad(n.conversacionesIa)} de {cantidad(limite)} · <span className={`font-semibold ${nivelDeIa(n.porcentajeIa)}`}>{porcentaje(n.porcentajeIa)}</span>
    </>
  );
}

/** Celda sin dato: una raya a la vista y "Sin dato" para el lector de pantalla. */
function SinDato() {
  return (
    <>
      <span aria-hidden className="text-suave">
        —
      </span>
      <span className="sr-only">Sin dato</span>
    </>
  );
}

/** Encabezado que ordena: un enlace (funciona sin JavaScript) y aria-sort con el orden actual. */
function Encabezado({ columna, titulo, orden, enlace, alDerecha }: { columna: Columna; titulo: string; orden: Orden; enlace: string; alDerecha: boolean }) {
  const sort = orden.columna !== columna ? 'none' : orden.direccion === 'asc' ? 'ascending' : 'descending';
  const Icono = sort === 'ascending' ? ArrowUp : sort === 'descending' ? ArrowDown : ArrowUpDown;
  return (
    <th scope="col" aria-sort={sort} className={`px-2 py-1 font-medium ${alDerecha ? 'text-right' : ''}`}>
      <Link
        href={enlace}
        scroll={false}
        className={`inline-flex min-h-11 items-center gap-1 rounded-lg px-2 whitespace-nowrap transition-colors duration-150 hover:bg-superficie hover:text-texto ${sort === 'none' ? '' : 'text-texto'}`}
      >
        {titulo}
        <Icono aria-hidden className={`size-4 ${sort === 'none' ? 'opacity-50' : ''}`} />
      </Link>
    </th>
  );
}

/** Lo que pide atención HOY (no depende del mes elegido), con enlace al detalle del negocio. */
function ListaDeAlertas({ alertas, detalle }: { alertas: Alertas; detalle: (negocioId: string) => string }) {
  const fecha = (iso: string) => fechaLarga(fechaDe(iso, ZONA_DEL_PANEL));
  const filas: { clave: string; negocioId: string; nombre: string; Icono: LucideIcon; color: string; texto: ReactNode }[] = [
    ...alertas.cercaDelLimite.map((a) => ({
      clave: `limite-${a.negocioId}`,
      negocioId: a.negocioId,
      nombre: a.nombre,
      Icono: TrendingUp,
      color: a.porcentaje >= 100 ? 'text-peligro' : 'text-aviso',
      texto: `Va en el ${porcentaje(a.porcentaje)} de las conversaciones de su plan${a.plan ? ` ${a.plan}` : ''} (${cantidad(a.conversacionesIa)} de ${cantidad(a.limite)}). Candidato a subir de plan.`,
    })),
    ...alertas.pruebasPorVencer.map((a) => ({
      clave: `prueba-${a.negocioId}`,
      negocioId: a.negocioId,
      nombre: a.nombre,
      Icono: Hourglass,
      color: 'text-aviso',
      texto: Date.parse(a.pruebaHasta) <= Date.now() ? `La prueba venció el ${fecha(a.pruebaHasta)} y sigue en prueba.` : `La prueba vence el ${fecha(a.pruebaHasta)}.`,
    })),
    ...alertas.sinCitas.map((a) => ({
      clave: `citas-${a.negocioId}`,
      negocioId: a.negocioId,
      nombre: a.nombre,
      Icono: CalendarX,
      color: 'text-suave',
      texto: a.ultimaCitaCreada ? `Sin citas nuevas desde el ${fechaCorta(fechaDe(a.ultimaCitaCreada, ZONA_DEL_PANEL))}.` : 'Nunca ha tenido una cita.',
    })),
  ];

  return (
    <section aria-labelledby="atencion" className="mb-4 rounded-xl border border-borde bg-superficie p-4 lg:p-6">
      <h2 id="atencion" className="font-semibold">
        Piden atención hoy
      </h2>
      <p className="text-sm text-suave">Cerca del límite del plan, pruebas que vencen en 5 días y negocios sin citas nuevas en 14 días.</p>
      {filas.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-exito">
          <CircleCheck aria-hidden className="size-4 shrink-0" />
          Nada que atender hoy.
        </p>
      ) : (
        <ul aria-label="Alertas" className="mt-3 divide-y divide-borde border-y border-borde">
          {filas.map((f) => (
            <li key={f.clave}>
              <Link href={detalle(f.negocioId)} className="-mx-2 flex min-h-11 items-start gap-2.5 rounded-lg px-2 py-2.5 transition-colors duration-150 hover:bg-fondo">
                <f.Icono aria-hidden className={`mt-0.5 size-5 shrink-0 ${f.color}`} />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-semibold break-words">{f.nombre}</span>
                  <span className="block text-suave">{f.texto}</span>
                </span>
                <ChevronRight aria-hidden className="mt-0.5 size-5 shrink-0 text-suave" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
