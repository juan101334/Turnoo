import { CalendarPlus } from 'lucide-react';
import Link from 'next/link';
import { barberos as leerBarberos, citasDelDia } from '@/lib/datos';
import { diaRelativo, fechaLarga, hoyEn } from '@/lib/fechas';
import type { UsuarioDelNegocio } from '@/lib/sesion';
import { FiltroDeBarberos } from './filtro-de-barberos';
import { ListaDeCitas } from './lista-de-citas';
import { TiraDeDias } from './tira-de-dias';

/**
 * Agenda de un día: encabezado, filtro por barbero (solo el dueño), tira de días (opcional),
 * botón de nueva cita y la lista. `ruta` es la página que la muestra (/hoy o /agenda).
 */
export async function VistaDeAgenda({
  usuario,
  fecha,
  conTira,
  ruta,
  barbero,
}: {
  usuario: UsuarioDelNegocio;
  fecha: string;
  conTira: boolean;
  ruta: '/hoy' | '/agenda';
  /** ?barbero= tal como llegó; se ignora si no es un barbero activo del negocio. */
  barbero?: string | undefined;
}) {
  const zona = usuario.negocio.zonaHoraria;
  const hoy = hoyEn(zona);
  const esDueno = usuario.rol === 'dueno';
  const equipo = esDueno ? (await leerBarberos()).filter((b) => b.activo) : [];
  // Con un solo barbero el filtro no aporta nada.
  const conFiltro = equipo.length > 1;
  const elegido = conFiltro ? equipo.find((b) => b.id === barbero) : undefined;
  const citas = await citasDelDia(fecha, zona, { profesionalId: elegido?.id });
  const relativo = diaRelativo(fecha, hoy);

  const enlace = (cambios: { fecha?: string; barbero?: string | undefined }) => {
    const q = new URLSearchParams();
    const f = 'fecha' in cambios ? cambios.fecha : ruta === '/agenda' ? fecha : undefined;
    if (f) q.set('fecha', f);
    const b = 'barbero' in cambios ? cambios.barbero : elegido?.id;
    if (b) q.set('barbero', b);
    const texto = q.toString();
    return texto ? `${ruta}?${texto}` : ruta;
  };
  const nueva = new URLSearchParams({ fecha: fecha < hoy ? hoy : fecha, ...(elegido && { barbero: elegido.id }) });

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-suave">{usuario.negocio.nombre}</p>
          <h1 className="text-2xl font-semibold">{relativo ?? 'Agenda'}</h1>
          <p className="text-sm text-suave first-letter:uppercase">{fechaLarga(fecha)}</p>
        </div>
        <Link
          href={`/citas/nueva?${nueva}`}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-marca px-4 font-semibold text-white transition-colors duration-150 hover:bg-marca-oscura"
        >
          <CalendarPlus aria-hidden className="size-5" />
          Nueva cita
        </Link>
      </div>
      {conFiltro && (
        <div className="mb-3">
          <FiltroDeBarberos barberos={equipo} elegido={elegido?.id} enlace={(b) => enlace({ barbero: b })} />
        </div>
      )}
      {conTira && (
        <div className="mb-4">
          <TiraDeDias seleccionada={fecha} hoy={hoy} enlace={(f) => enlace({ fecha: f })} />
          <form action="/agenda" className="mt-2 flex items-center gap-2 text-sm">
            <label htmlFor="otra-fecha" className="text-suave">
              Otra fecha
            </label>
            <input id="otra-fecha" type="date" name="fecha" defaultValue={fecha} className="min-h-11 rounded-lg border border-borde bg-superficie px-2 text-base" />
            {elegido && <input type="hidden" name="barbero" value={elegido.id} />}
            <button type="submit" className="min-h-11 cursor-pointer rounded-lg border border-borde bg-superficie px-3 font-medium hover:bg-fondo">
              Ver
            </button>
          </form>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {citas.length === 1 ? '1 cita' : `${citas.length} citas`}
        {elegido && ` de ${elegido.nombre}`}
      </p>
      <ListaDeCitas
        citas={citas}
        zona={zona}
        mostrarBarbero={esDueno && !elegido}
        {...(fecha === hoy && { ahora: new Date() })}
        vacia={<p>{relativo === 'Hoy' ? 'No hay citas para hoy' : 'No hay citas este día'}{elegido ? ` con ${elegido.nombre}.` : '.'}</p>}
      />
    </>
  );
}
