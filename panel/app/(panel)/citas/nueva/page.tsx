import { ChevronLeft, Search, UserPlus, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Campo } from '@/componentes/formulario';
import { FormularioDeHora } from '@/componentes/formulario-de-hora';
import { HorasLibres } from '@/componentes/horas-libres';
import { TiraDeDias } from '@/componentes/tira-de-dias';
import { duracionLegible, horaElegida, horasLibres } from '@/lib/agenda';
import { nombresDeServicios, pesos, telefonoLegible } from '@/lib/citas';
import { barberos as leerBarberos, clientes as buscarClientes, clienteSiExiste, esId, huecosDelDia, serviciosDe } from '@/lib/datos';
import { esFechaValida, fechaLarga, hoyEn } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';
import { crearCita } from '../acciones';

export const metadata: Metadata = { title: 'Nueva cita' };

type Parametros = {
  cliente?: string;
  buscar?: string;
  barbero?: string;
  servicios?: string | string[];
  fecha?: string;
  /** Instante ISO: llega desde un hueco de la agenda y deja marcada esa hora (o la siguiente libre). */
  hora?: string;
};

/** Resultados de la búsqueda de clientes que se muestran: los primeros. */
const RESULTADOS = 8;

/**
 * Nueva cita, primero el cliente: se busca por nombre o teléfono, o se elige "Cliente nuevo".
 * Después barbero, servicios, día y hora, con un resumen fijo abajo. Todo lo elegido va en la URL
 * (sin JavaScript obligatorio), salvo el teléfono: de un cliente existente solo viaja su id y el
 * servidor busca el número. Las reglas (horario, anticipación, choques, plan) las pone el backend.
 */
export default async function PaginaNuevaCita({ searchParams }: { searchParams: Promise<Parametros> }) {
  const usuario = await exigirUsuario('agenda');
  const zona = usuario.negocio.zonaHoraria;
  const hoy = hoyEn(zona);
  const p = await searchParams;

  const existente = p.cliente && p.cliente !== 'nuevo' ? await clienteSiExiste(p.cliente) : null;
  const clienteUsable = existente && !existente.anonimizadoEn && existente.telefono ? existente : null;
  const esNuevo = p.cliente === 'nuevo';
  const conCliente = esNuevo || clienteUsable !== null;
  const buscar = (p.buscar ?? '').trim().slice(0, 100);
  const encontrados =
    !conCliente && buscar ? (await buscarClientes(buscar, 0)).clientes.filter((c) => !c.anonimizadoEn).slice(0, RESULTADOS) : [];

  const activos = (await leerBarberos()).filter((b) => b.activo);
  const barbero = activos.find((b) => b.id === p.barbero) ?? (activos.length === 1 ? activos[0] : undefined);
  const servicios = barbero && conCliente ? (await serviciosDe(barbero.id)).filter((s) => s.activo) : [];
  const pedidos = new Set([p.servicios ?? []].flat().filter(esId));
  const elegidos = servicios.filter((s) => pedidos.has(s.id));
  const fecha = esFechaValida(p.fecha) && p.fecha >= hoy ? p.fecha : hoy;
  const horas = barbero && elegidos.length > 0 ? horasLibres(await huecosDelDia(barbero.id, elegidos.map((s) => s.id), fecha), zona) : [];
  const hora = typeof p.hora === 'string' ? p.hora : undefined;

  /** La URL con lo elegido hasta ahora, cambiando solo lo indicado. */
  const enlace = (cambios: { cliente?: string | null; barbero?: string; fecha?: string; servicios?: boolean; buscar?: string }) => {
    const q = new URLSearchParams();
    const c = 'cliente' in cambios ? cambios.cliente : conCliente ? p.cliente : undefined;
    if (c) q.set('cliente', c);
    if (cambios.buscar) q.set('buscar', cambios.buscar);
    const b = cambios.barbero ?? barbero?.id;
    if (b) q.set('barbero', b);
    if (cambios.servicios !== false) for (const s of elegidos) q.append('servicios', s.id);
    q.set('fecha', cambios.fecha ?? fecha);
    if (hora && !cambios.fecha) q.set('hora', hora);
    return `/citas/nueva?${q}`;
  };
  /** Lo que se conserva al enviar los formularios GET (búsqueda y servicios). */
  const ocultos = (sin: ('cliente' | 'servicios')[] = []) => (
    <>
      {!sin.includes('cliente') && conCliente && p.cliente && <input type="hidden" name="cliente" value={p.cliente} />}
      {barbero && <input type="hidden" name="barbero" value={barbero.id} />}
      {!sin.includes('servicios') && elegidos.map((s) => <input key={s.id} type="hidden" name="servicios" value={s.id} />)}
      <input type="hidden" name="fecha" value={fecha} />
      {hora && <input type="hidden" name="hora" value={hora} />}
    </>
  );

  const nombreCliente = clienteUsable ? (clienteUsable.nombre ?? 'Cliente sin nombre') : 'Cliente nuevo';
  const duracion = elegidos.reduce((m, s) => m + s.duracionMinutos, 0);
  const total = elegidos.reduce((t, s) => t + s.precioCop, 0);
  const resumen = [nombreCliente, nombresDeServicios(elegidos), ...(activos.length > 1 && barbero ? [barbero.nombre] : []), duracionLegible(duracion), pesos(total)].join(' · ');

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/agenda?fecha=${fecha}`} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca">
        <ChevronLeft aria-hidden className="size-5" />
        Agenda
      </Link>
      <h1 className="mb-4 text-2xl font-semibold">Nueva cita</h1>

      <section aria-labelledby="paso-cliente" className="mb-5">
        <h2 id="paso-cliente" className="mb-2 text-sm font-medium">
          Cliente
        </h2>
        {conCliente ? (
          <div className="flex items-center gap-3 rounded-xl border border-marca bg-marca-suave p-3">
            {esNuevo ? <UserPlus aria-hidden className="size-5 shrink-0 text-marca" /> : <UserRound aria-hidden className="size-5 shrink-0 text-marca" />}
            <p className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{nombreCliente}</span>
              <span className="block text-sm text-suave tabular-nums">
                {clienteUsable?.telefono ? telefonoLegible(clienteUsable.telefono) : 'Escribe su teléfono al final.'}
              </span>
            </p>
            <Link href={enlace({ cliente: null })} className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-marca hover:bg-superficie">
              Cambiar
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {p.cliente && p.cliente !== 'nuevo' && (
              <p className="text-sm text-aviso">Ese cliente ya no está disponible o no tiene teléfono. Búscalo otra vez o agéndalo como nuevo.</p>
            )}
            <form action="/citas/nueva" role="search" className="flex gap-2">
              {ocultos(['cliente'])}
              <label htmlFor="buscar-cliente" className="sr-only">
                Buscar cliente por nombre o teléfono
              </label>
              <div className="relative flex-1">
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-suave" />
                <input
                  id="buscar-cliente"
                  name="buscar"
                  type="search"
                  defaultValue={buscar}
                  placeholder="Nombre o teléfono"
                  maxLength={100}
                  autoComplete="off"
                  className="min-h-11 w-full rounded-lg border border-borde bg-superficie pr-3 pl-10 text-base"
                />
              </div>
              <button type="submit" className="min-h-11 cursor-pointer rounded-lg bg-marca px-4 font-semibold text-white hover:bg-marca-oscura">
                Buscar
              </button>
            </form>

            {buscar && (
              <div aria-live="polite">
                {encontrados.length === 0 ? (
                  <p className="text-sm text-suave">Ningún cliente coincide con &quot;{buscar}&quot;.</p>
                ) : (
                  <ul aria-label="Clientes encontrados" className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie">
                    {encontrados.map((c) => (
                      <li key={c.id}>
                        {c.telefono ? (
                          <Link href={enlace({ cliente: c.id })} className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors duration-150 hover:bg-fondo">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{c.nombre ?? 'Sin nombre'}</span>
                              <span className="block text-sm text-suave tabular-nums">{telefonoLegible(c.telefono)}</span>
                            </span>
                            <span className="text-sm font-semibold text-marca">Elegir</span>
                          </Link>
                        ) : (
                          <p className="flex min-h-14 flex-col justify-center px-4 py-2 text-suave">
                            <span className="truncate font-medium">{c.nombre ?? 'Sin nombre'}</span>
                            <span className="text-sm">Sin teléfono guardado: agéndalo como cliente nuevo.</span>
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <Link
              href={enlace({ cliente: 'nuevo' })}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-dashed border-borde-fuerte bg-superficie font-semibold text-marca transition-colors duration-150 hover:border-marca hover:bg-marca-suave"
            >
              <UserPlus aria-hidden className="size-5" />
              Cliente nuevo
            </Link>
          </div>
        )}
      </section>

      {conCliente && activos.length === 0 && <p className="text-suave">No hay barberos activos.</p>}

      {conCliente && activos.length > 1 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-medium">Barbero</h2>
          <div className="flex flex-wrap gap-2">
            {activos.map((b) => (
              <Link
                key={b.id}
                href={enlace({ barbero: b.id, servicios: false })}
                aria-current={b.id === barbero?.id ? 'true' : undefined}
                className={`flex min-h-11 items-center rounded-lg border px-4 font-medium transition-colors duration-150 ${
                  b.id === barbero?.id ? 'border-marca bg-marca text-white' : 'border-borde bg-superficie hover:bg-fondo'
                }`}
              >
                {b.nombre}
              </Link>
            ))}
          </div>
        </section>
      )}

      {conCliente && barbero && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-medium">Servicios{activos.length === 1 && ` de ${barbero.nombre}`}</h2>
          {servicios.length === 0 ? (
            <p className="text-sm text-suave">Este barbero no tiene servicios activos.</p>
          ) : (
            <form action="/citas/nueva" className="flex flex-col gap-2">
              {ocultos(['servicios'])}
              {servicios.map((s) => (
                <label
                  key={s.id}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-borde bg-superficie px-3 has-[:checked]:border-marca has-[:checked]:bg-marca-suave"
                >
                  <input type="checkbox" name="servicios" value={s.id} defaultChecked={pedidos.has(s.id)} className="size-5 accent-marca" />
                  <span className="flex-1">
                    {s.nombre} <span className="text-sm text-suave">· {s.duracionMinutos} min</span>
                  </span>
                  <span className="tabular-nums">{pesos(s.precioCop)}</span>
                </label>
              ))}
              <button type="submit" className="min-h-11 cursor-pointer rounded-lg border border-borde bg-superficie font-semibold hover:bg-fondo">
                Ver horas libres
              </button>
            </form>
          )}
        </section>
      )}

      {conCliente && barbero && elegidos.length > 0 && (
        <>
          <section className="mb-4">
            <h2 className="mb-2 text-sm font-medium">Día</h2>
            <TiraDeDias seleccionada={fecha} hoy={hoy} enlace={(f) => enlace({ fecha: f })} />
            <p className="mt-2 font-medium first-letter:uppercase">{fechaLarga(fecha)}</p>
          </section>

          {horas.length === 0 ? (
            <HorasLibres horas={[]} />
          ) : (
            <FormularioDeHora accion={crearCita} horas={horas} elegida={horaElegida(horas, hora)} resumen={resumen} boton="Agendar cita" enviando="Agendando…">
              <input type="hidden" name="profesionalId" value={barbero.id} />
              {elegidos.map((s) => (
                <input key={s.id} type="hidden" name="servicioIds" value={s.id} />
              ))}
              {clienteUsable ? (
                <input type="hidden" name="clienteId" value={clienteUsable.id} />
              ) : (
                <>
                  <Campo
                    id="telefono"
                    name="telefono"
                    type="tel"
                    etiqueta="Teléfono del cliente"
                    ayuda="Con o sin +57. Si ya existe, se usa ese cliente."
                    inputMode="tel"
                    autoComplete="off"
                    required
                  />
                  <Campo id="nombre" name="nombre" etiqueta="Nombre del cliente (opcional)" autoComplete="off" maxLength={100} />
                </>
              )}
              <Campo id="notas" name="notas" etiqueta="Notas (opcional)" autoComplete="off" maxLength={500} />
            </FormularioDeHora>
          )}
        </>
      )}
    </div>
  );
}
