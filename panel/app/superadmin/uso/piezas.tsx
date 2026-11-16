import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Aviso } from '@/componentes/aviso';
import { cantidad, faltaDetalle, mesActual, mesVecino, minutosDeAudio, SERIES, type Serie, type UsoDelDia } from '@/lib/consumo';
import { fechaCorta } from '@/lib/fechas';
import { nombreDelMes } from '@/lib/plan';

/** Piezas que comparten el resumen de la plataforma y el detalle de un negocio. */

/** ‹ noviembre de 2026 ›. No deja pasar del mes en curso: del futuro no hay datos. */
export function SelectorDeMes({ mes, enlace }: { mes: string; enlace: (mes: string) => string }) {
  const anterior = mesVecino(mes, -1);
  const siguiente = mesVecino(mes, 1);
  const boton = 'flex size-11 shrink-0 items-center justify-center rounded-lg border border-borde bg-superficie';
  return (
    <nav aria-label="Mes" className="flex items-center gap-1">
      <Link href={enlace(anterior)} scroll={false} aria-label={`Mes anterior: ${nombreDelMes(anterior)}`} className={`${boton} hover:bg-hundido`}>
        <ChevronLeft aria-hidden className="size-5" />
      </Link>
      <p className="min-w-40 flex-1 text-center font-medium first-letter:uppercase sm:flex-none">{nombreDelMes(mes)}</p>
      {mes < mesActual() ? (
        <Link href={enlace(siguiente)} scroll={false} aria-label={`Mes siguiente: ${nombreDelMes(siguiente)}`} className={`${boton} hover:bg-hundido`}>
          <ChevronRight aria-hidden className="size-5" />
        </Link>
      ) : (
        <span aria-hidden className={`${boton} text-suave opacity-40`}>
          <ChevronRight className="size-5" />
        </span>
      )}
    </nav>
  );
}

/** Una cifra con su nombre, dentro de un <dl>. */
export function Cifra({ titulo, Icono, valor, detalle }: { titulo: string; Icono: LucideIcon; valor: ReactNode; detalle?: ReactNode }) {
  return (
    <div className="rounded-xl border border-borde bg-superficie p-4">
      <dt className="flex items-center gap-1.5 text-sm text-suave">
        <Icono aria-hidden className="size-4 shrink-0" />
        {titulo}
      </dt>
      <dd>
        <span className="cifras block text-2xl font-semibold">{valor}</span>
        {detalle && <span className="block text-sm text-suave">{detalle}</span>}
      </dd>
    </div>
  );
}

/** Tarjeta con título, como las de la ficha del negocio. */
export function Seccion({ id, titulo, ayuda, children, className = '' }: { id: string; titulo: string; ayuda?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={`rounded-xl border border-borde bg-superficie p-4 lg:p-6 ${className}`}>
      <h2 id={id} className="font-semibold">
        {titulo}
      </h2>
      {ayuda && <p className="text-sm text-suave">{ayuda}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Una fila "nombre … valor" con una barra proporcional debajo (sin barra si `de` es 0). */
export function FilaConBarra({ nombre, valor, de, color = 'bg-marca' }: { nombre: ReactNode; valor: number; de: number; color?: string }) {
  return (
    <li className="py-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{nombre}</span>
        <span className="cifras font-semibold">{cantidad(valor)}</span>
      </div>
      <div aria-hidden className="mt-1 h-1.5 overflow-hidden rounded-full bg-hundido">
        {valor > 0 && de > 0 && <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(2, (valor / de) * 100)}%` }} />}
      </div>
    </li>
  );
}

/** Días que llevan número bajo el gráfico: el 1 y de cinco en cinco. */
const conNumero = (dia: number) => dia === 1 || dia % 5 === 0;

/**
 * Barras por día, hechas con CSS (sin librería de gráficos). El dibujo es una imagen con su
 * resumen para el lector de pantalla; los números exactos están en la tabla plegada de abajo.
 */
export function GraficoDiario({
  mes,
  dias,
  serie,
  enlaceDeSerie,
  detalleDesde,
}: {
  mes: string;
  dias: UsoDelDia[];
  serie: Serie;
  enlaceDeSerie: (serie: Serie) => string;
  detalleDesde: string | null;
}) {
  const { etiqueta, valor, conDetalle } = SERIES[serie];
  const valores = dias.map(valor);
  const maximo = Math.max(0, ...valores);
  const total = valores.reduce((suma, v) => suma + v, 0);
  const diaDelMaximo = valores.indexOf(maximo) + 1;
  const resumen =
    total === 0
      ? `${etiqueta} por día en ${nombreDelMes(mes)}: nada en el mes.`
      : `${etiqueta} por día en ${nombreDelMes(mes)}: ${cantidad(total)} en el mes. El día con más fue el ${diaDelMaximo}, con ${cantidad(maximo)}.`;

  return (
    <Seccion id="por-dia" titulo="Por día" ayuda={total === 0 ? 'Nada en el mes.' : `${cantidad(total)} en el mes.`}>
      <nav aria-label="Qué mostrar por día" className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {(Object.keys(SERIES) as Serie[]).map((s) => (
          <Link
            key={s}
            href={enlaceDeSerie(s)}
            scroll={false}
            aria-current={s === serie ? 'true' : undefined}
            className={`flex min-h-11 items-center rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
              s === serie ? 'border-marca bg-marca text-white' : 'border-borde bg-superficie hover:bg-hundido'
            }`}
          >
            {SERIES[s].etiqueta}
          </Link>
        ))}
      </nav>

      {conDetalle && faltaDetalle(mes, detalleDesde) && (
        <div className="mb-4">
          <Aviso tipo="info">
            {detalleDesde === null
              ? 'Todavía no hay detalle por día: el registro empieza con la primera respuesta del asistente o el primer mensaje automático.'
              : `Antes del ${fechaCorta(detalleDesde)} no hay detalle por día: el registro empezó ese día. Los días anteriores salen en cero, aunque hubo uso; el total del mes sí lo incluye.`}
          </Aviso>
        </div>
      )}

      <div role="img" aria-label={resumen}>
        <div className="relative flex h-40 items-end gap-0.5 border-b border-borde-fuerte pt-5">
          {maximo > 0 && (
            <div className="absolute inset-x-0 top-5 border-t border-dashed border-borde">
              <span className="cifras absolute -top-5 right-0 text-xs text-suave">{cantidad(maximo)}</span>
            </div>
          )}
          {valores.map((v, i) => (
            <div key={i} title={`Día ${i + 1}: ${cantidad(v)}`} className="relative flex h-full flex-1 items-end">
              {v > 0 && <div className="min-h-0.5 w-full rounded-t-sm bg-marca" style={{ height: `${(v / maximo) * 100}%` }} />}
            </div>
          ))}
        </div>
        <div aria-hidden className="mt-1 flex gap-0.5">
          {valores.map((_, i) => (
            <span key={i} className="cifras flex flex-1 justify-center text-xs whitespace-nowrap text-suave">
              {conNumero(i + 1) ? i + 1 : ''}
            </span>
          ))}
        </div>
      </div>

      <details className="group mt-3">
        <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1 rounded-lg text-sm font-semibold text-marca [&::-webkit-details-marker]:hidden">
          Ver los números de cada día
          <ChevronRight aria-hidden className="size-4 transition-transform duration-150 group-open:rotate-90" />
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-suave">
              <tr className="border-b border-borde">
                <th scope="col" className="py-2 pr-3 font-medium">Día</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Respuestas del asistente</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Mensajes automáticos</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Audio</th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">Citas creadas</th>
              </tr>
            </thead>
            <tbody className="cifras divide-y divide-borde">
              {dias.map((d, i) => (
                <tr key={d.fecha}>
                  <th scope="row" className="py-1.5 pr-3 font-normal">{i + 1}</th>
                  <td className="px-3 py-1.5 text-right">{cantidad(d.atencionesIa)}</td>
                  <td className="px-3 py-1.5 text-right">{cantidad(d.plantillas)}</td>
                  <td className="px-3 py-1.5 text-right">{minutosDeAudio(d.segundosAudio)}</td>
                  <td className="py-1.5 pl-3 text-right">{cantidad(d.citasCreadas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Seccion>
  );
}
