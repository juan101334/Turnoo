import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { FormularioConEstado } from '@/componentes/formulario-con-estado';
import { Campo } from '@/componentes/formulario';
import { HorasLibres } from '@/componentes/horas-libres';
import { TiraDeDias } from '@/componentes/tira-de-dias';
import { pesos } from '@/lib/citas';
import { barberos as leerBarberos, esId, huecosDelDia, serviciosDe } from '@/lib/datos';
import { esFechaValida, fechaLarga, hoyEn } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';
import { crearCita } from '../acciones';

export const metadata: Metadata = { title: 'Nueva cita' };

type Parametros = { barbero?: string; servicios?: string | string[]; fecha?: string };

/**
 * Nueva cita en un solo paso por pantalla, sin JavaScript obligatorio: barbero, servicios y día
 * van en la URL (?barbero=&servicios=&fecha=); la hora y el cliente se envían al final.
 * Las reglas (horario, anticipación, choques, límites del plan) las aplica el backend.
 */
export default async function PaginaNuevaCita({ searchParams }: { searchParams: Promise<Parametros> }) {
  const usuario = await exigirUsuario('agenda');
  const zona = usuario.negocio.zonaHoraria;
  const hoy = hoyEn(zona);
  const p = await searchParams;

  const activos = (await leerBarberos()).filter((b) => b.activo);
  const barbero = activos.find((b) => b.id === p.barbero) ?? (activos.length === 1 ? activos[0] : undefined);
  const servicios = barbero ? (await serviciosDe(barbero.id)).filter((s) => s.activo) : [];
  const pedidos = new Set([p.servicios ?? []].flat().filter(esId));
  const elegidos = servicios.filter((s) => pedidos.has(s.id));
  const fecha = esFechaValida(p.fecha) && p.fecha >= hoy ? p.fecha : hoy;
  const huecos = barbero && elegidos.length > 0 ? await huecosDelDia(barbero.id, elegidos.map((s) => s.id), fecha) : [];

  const enlace = (cambios: Partial<{ barbero: string; fecha: string }>, conServicios = true) => {
    const q = new URLSearchParams();
    const b = cambios.barbero ?? barbero?.id;
    if (b) q.set('barbero', b);
    if (conServicios) for (const s of elegidos) q.append('servicios', s.id);
    q.set('fecha', cambios.fecha ?? fecha);
    return `/citas/nueva?${q}`;
  };

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/agenda?fecha=${fecha}`} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca">
        <ChevronLeft aria-hidden className="size-5" />
        Agenda
      </Link>
      <h1 className="mb-4 text-2xl font-semibold">Nueva cita</h1>

      {activos.length === 0 && <p className="text-suave">No hay barberos activos.</p>}

      {activos.length > 1 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-medium">Barbero</h2>
          <div className="flex flex-wrap gap-2">
            {activos.map((b) => (
              <Link
                key={b.id}
                href={enlace({ barbero: b.id }, false)}
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

      {barbero && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-medium">Servicios{activos.length === 1 && ` de ${barbero.nombre}`}</h2>
          {servicios.length === 0 ? (
            <p className="text-sm text-suave">Este barbero no tiene servicios activos.</p>
          ) : (
            <form action="/citas/nueva" className="flex flex-col gap-2">
              <input type="hidden" name="barbero" value={barbero.id} />
              <input type="hidden" name="fecha" value={fecha} />
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

      {barbero && elegidos.length > 0 && (
        <>
          <section className="mb-4">
            <h2 className="mb-2 text-sm font-medium">Día</h2>
            <TiraDeDias seleccionada={fecha} hoy={hoy} enlace={(f) => enlace({ fecha: f })} />
            <p className="mt-2 font-medium first-letter:uppercase">{fechaLarga(fecha)}</p>
          </section>

          {huecos.length === 0 ? (
            <HorasLibres huecos={[]} zona={zona} />
          ) : (
            <FormularioConEstado accion={crearCita} boton="Agendar cita" enviando="Agendando…">
              <input type="hidden" name="profesionalId" value={barbero.id} />
              {elegidos.map((s) => (
                <input key={s.id} type="hidden" name="servicioIds" value={s.id} />
              ))}
              <HorasLibres huecos={huecos} zona={zona} />
              <p className="text-sm text-suave">
                {elegidos.reduce((m, s) => m + s.duracionMinutos, 0)} min · {pesos(elegidos.reduce((t, s) => t + s.precioCop, 0))}
              </p>
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
              <Campo id="notas" name="notas" etiqueta="Notas (opcional)" autoComplete="off" maxLength={500} />
            </FormularioConEstado>
          )}
        </>
      )}
    </div>
  );
}
