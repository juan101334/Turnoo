import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { pesos } from '@/lib/citas';
import { cantidad, haceDias, leerSerie, mesElegido, minutosDeAudio, porcentaje, tokens, ZONA_DEL_PANEL, type Serie } from '@/lib/consumo';
import { MOTIVOS } from '@/lib/conversaciones';
import { fechaDe, fechaLarga } from '@/lib/fechas';
import { medidor, type Medidor } from '@/lib/plan';
import { exigirSuperadmin } from '@/lib/sesion-superadmin';
import { consumoDeNegocio, negocio as leerNegocio } from '@/lib/superadmin';
import { EstadoDeNegocio } from '../../estado-de-negocio';
import { FilaConBarra, GraficoDiario, Seccion, SelectorDeMes } from '../piezas';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await exigirSuperadmin();
  return { title: `Uso de ${(await leerNegocio((await params).id)).nombre} · Superadmin` };
}

const COLOR_DEL_MEDIDOR: Record<Medidor['nivel'], string> = { normal: 'bg-marca', alto: 'bg-aviso', lleno: 'bg-peligro' };

/** Una línea "nombre … valor" de una lista de datos. */
function Dato({ nombre, children, fuerte = false }: { nombre: string; children: ReactNode; fuerte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 text-sm ${fuerte ? 'font-semibold' : ''}`}>
      <dt className={fuerte ? '' : 'text-suave'}>{nombre}</dt>
      <dd className="cifras text-right">{children}</dd>
    </div>
  );
}

/**
 * Uso de un negocio en un mes (?mes=AAAA-MM): el asistente frente al plan, las citas y sus tasas,
 * las derivaciones por motivo, los envíos que fallaron y el costo estimado. Solo agregados: de las
 * derivaciones se muestra el motivo, nunca lo que escribió el cliente.
 */
export default async function PaginaUsoDeNegocio({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string; ver?: string }> }) {
  await exigirSuperadmin();
  const [{ id }, p] = await Promise.all([params, searchParams]);
  const mes = mesElegido(p.mes);
  const serie = leerSerie(p.ver);
  const n = await consumoDeNegocio(id, mes);
  const esEsteMes = mes === mesElegido(undefined);

  const enlace = (cambio: { mes?: string; serie?: Serie } = {}) => {
    const q = new URLSearchParams();
    const m = cambio.mes ?? mes;
    const s = cambio.serie ?? serie;
    if (m !== mesElegido(undefined)) q.set('mes', m);
    if (s !== 'ia') q.set('ver', s);
    return q.size > 0 ? `/superadmin/uso/${n.negocioId}?${q}` : `/superadmin/uso/${n.negocioId}`;
  };

  const ia = medidor(n.conversacionesIa, n.plan?.maxConversacionesIa ?? null);
  const e = n.citasPorEstado;
  const estados = [
    { nombre: 'Completadas', valor: e.completadas, color: 'bg-estado-completada' },
    { nombre: 'Confirmadas', valor: e.confirmadas, color: 'bg-estado-confirmada' },
    { nombre: 'Pendientes', valor: e.pendientes, color: 'bg-estado-pendiente' },
    { nombre: 'Por aprobar', valor: e.porAprobar, color: 'bg-estado-por-aprobar' },
    { nombre: 'No asistió', valor: e.noAsistio, color: 'bg-estado-no-asistio' },
    { nombre: 'Canceladas', valor: e.canceladas, color: 'bg-estado-cancelada' },
  ];
  const fallos = [
    { nombre: 'Recordatorios que no salieron', valor: n.fallos.recordatorios },
    { nombre: 'Avisos al dueño que no salieron', valor: n.fallos.avisos },
    { nombre: 'Mensajes que WhatsApp rechazó', valor: n.fallos.mensajes },
  ];

  return (
    <div>
      <Link href={esEsteMes ? '/superadmin/uso' : `/superadmin/uso?mes=${mes}`} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca">
        <ChevronLeft aria-hidden className="size-5" />
        Uso
      </Link>
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold break-words">{n.nombre}</h1>
        <EstadoDeNegocio estado={n.estado} />
      </div>
      <p className="mb-3 text-sm text-suave">
        {n.plan ? `Plan ${n.plan.nombre} · ${pesos(n.plan.precioMensualCop)} al mes` : 'Sin plan'}
        {n.estado === 'prueba' && n.pruebaHasta && ` · prueba hasta el ${fechaLarga(fechaDe(n.pruebaHasta, ZONA_DEL_PANEL))}`} ·{' '}
        <Link href={`/superadmin/negocios/${n.negocioId}`} className="font-medium text-marca underline decoration-1 underline-offset-4 hover:decoration-2">
          Ficha del negocio
        </Link>
      </p>
      <div className="mb-4 sm:w-fit">
        <SelectorDeMes mes={mes} enlace={(m) => enlace({ mes: m })} />
      </div>

      {/* grid-cols-1 (minmax(0, 1fr)): sin ella, una tabla ancha estira la columna más que la pantalla. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <Seccion id="asistente" titulo="Asistente" ayuda="Cada cliente que el asistente atiende cuenta una vez en el mes.">
          <p className="mb-1.5 text-sm tabular-nums">
            <span className="cifras text-2xl font-semibold">{cantidad(ia.usado)}</span>
            <span className="text-suave">
              {ia.limite === null ? ` ${ia.usado === 1 ? 'conversación' : 'conversaciones'} · sin límite` : ` de ${cantidad(ia.limite)} conversaciones`}
              {n.porcentajeIa !== null && ` · ${porcentaje(n.porcentajeIa)}`}
            </span>
          </p>
          {ia.porcentaje !== null && (
            <div
              role="progressbar"
              aria-label="Conversaciones con el asistente: uso del mes"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={ia.porcentaje}
              className="mb-2 h-2.5 overflow-hidden rounded-full bg-fondo ring-1 ring-borde"
            >
              <div className={`h-full rounded-full ${COLOR_DEL_MEDIDOR[ia.nivel]}`} style={{ width: `${ia.porcentaje}%` }} />
            </div>
          )}
          {ia.nivel === 'lleno' && <p className="mb-2 text-sm font-semibold text-peligro">Llegó al límite: los clientes nuevos pasan directo a una persona.</p>}
          {ia.nivel === 'alto' && <p className="mb-2 text-sm font-semibold text-aviso">Cerca del límite: candidato a subir de plan.</p>}
          <dl className="divide-y divide-borde border-t border-borde">
            <Dato nombre="Tokens de entrada">{tokens(n.tokensEntrada)}</Dato>
            <Dato nombre="Tokens de salida">{tokens(n.tokensSalida)}</Dato>
            <Dato nombre="Audio transcrito">{minutosDeAudio(n.segundosAudio)}</Dato>
          </dl>
        </Seccion>

        <Seccion id="citas" titulo="Citas del mes" ayuda="Por su fecha, no por el día en que se agendaron.">
          <p className="mb-1.5 text-sm">
            <span className="cifras text-2xl font-semibold">{cantidad(n.citas)}</span>
            <span className="text-suave"> {n.citas === 1 ? 'cita' : 'citas'}</span>
          </p>
          {n.citas > 0 && (
            <ul aria-label="Citas por estado" className="mb-2">
              {estados.map((s) => (
                <FilaConBarra key={s.nombre} nombre={s.nombre} valor={s.valor} de={n.citas} color={s.color} />
              ))}
            </ul>
          )}
          <dl className="divide-y divide-borde border-t border-borde">
            <Dato nombre="No asistió, de las que ya pasaron">{n.porcentajeNoAsistio === null ? 'Sin citas pasadas' : porcentaje(n.porcentajeNoAsistio)}</Dato>
            <Dato nombre="Canceladas, del total">{n.porcentajeCancelacion === null ? 'Sin citas' : porcentaje(n.porcentajeCancelacion)}</Dato>
            {e.canceladas > 0 && (
              <Dato nombre="Quién canceló">
                cliente {n.canceladasPor.cliente} · negocio {n.canceladasPor.negocio} · sin aprobar a tiempo {n.canceladasPor.sistema}
              </Dato>
            )}
          </dl>
        </Seccion>

        <Seccion id="derivaciones" titulo="Derivaciones a una persona" ayuda="Las veces que el asistente pasó la conversación, por motivo.">
          {n.derivaciones === 0 ? (
            <p className="text-sm text-suave">Ninguna en el mes.</p>
          ) : (
            <>
              <p className="mb-1.5 text-sm">
                <span className="cifras text-2xl font-semibold">{cantidad(n.derivaciones)}</span>
                <span className="text-suave"> en el mes</span>
              </p>
              <ul aria-label="Derivaciones por motivo">
                {n.derivacionesPorMotivo.map((d) => (
                  <FilaConBarra key={d.motivo} nombre={MOTIVOS[d.motivo] ?? d.motivo} valor={d.cantidad} de={n.derivaciones} />
                ))}
              </ul>
            </>
          )}
        </Seccion>

        <Seccion id="envios" titulo="Mensajes automáticos y entregas" ayuda="Recordatorios de cita y avisos al dueño. WhatsApp los cobra aparte.">
          <dl className="divide-y divide-borde border-y border-borde">
            <Dato nombre="Mensajes automáticos enviados">{cantidad(n.plantillas)}</Dato>
            {fallos.map((f) => (
              <Dato key={f.nombre} nombre={f.nombre}>
                <span className={f.valor > 0 ? 'font-semibold text-peligro' : ''}>{cantidad(f.valor)}</span>
              </Dato>
            ))}
          </dl>
        </Seccion>

        <Seccion id="cuenta" titulo="Actividad y costo" ayuda="La última actividad es de hoy; el costo, del mes elegido." className="lg:col-span-2">
          <dl className="divide-y divide-borde border-y border-borde">
            <Dato nombre="Último mensaje de un cliente o cita nueva">{haceDias(n.diasSinActividad)}</Dato>
            {n.costo ? (
              <>
                <Dato nombre="Asistente">{pesos(n.costo.iaCop)}</Dato>
                <Dato nombre="Audio">{pesos(n.costo.audioCop)}</Dato>
                <Dato nombre="Mensajes automáticos">{pesos(n.costo.plantillasCop)}</Dato>
                <Dato nombre="Costo estimado del mes" fuerte>
                  {pesos(n.costo.totalCop)}
                </Dato>
                {n.plan && n.margenCop !== null && (
                  <Dato nombre={`Margen frente al plan (${pesos(n.plan.precioMensualCop)})`} fuerte>
                    <span className={n.margenCop < 0 ? 'text-peligro' : ''}>{pesos(n.margenCop)}</span>
                  </Dato>
                )}
              </>
            ) : (
              <Dato nombre="Costo estimado del mes">Sin tarifas en el servidor</Dato>
            )}
          </dl>
        </Seccion>

        <div className="lg:col-span-2">
          <GraficoDiario mes={mes} dias={n.diario} serie={serie} enlaceDeSerie={(s) => enlace({ serie: s })} detalleDesde={n.detallePorDiaDesde} />
        </div>
      </div>
    </div>
  );
}
