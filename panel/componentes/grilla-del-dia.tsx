import Link from 'next/link';
import { LlevarAAhora } from './llevar-a-ahora';
import { horaTapada, type Tramo } from '@/lib/agenda';
import { ESTADOS, type EstadoCita } from '@/lib/citas';

/** 15 minutos = 20 px: un corte de 30 min alcanza para la hora y el nombre. */
const PX_POR_MINUTO = 20 / 15;
const px = (minutos: number) => `${minutos * PX_POR_MINUTO}px`;

export interface BloqueDeCita {
  id: string;
  tramo: Tramo;
  hora: string;
  cliente: string;
  servicios: string;
  estado: EstadoCita;
  href: string;
  etiqueta: string;
}

export interface ColumnaDeBarbero {
  id: string;
  nombre: string;
  trabajo: Tramo[];
  citas: BloqueDeCita[];
  bloqueos: { clave: string; tramo: Tramo; motivo: string }[];
  huecos: { clave: string; tramo: Tramo; href: string; etiqueta: string; hora: string }[];
  /** No trabaja ese día: su columna se esconde hasta "Mostrar todos" (ver BarberosSinTurno). */
  sinTurno?: boolean;
}

/**
 * Alto de una línea en el bloque (text-xs con interlineado de 14 px, así una cita de 30 min tiene
 * dos líneas), y lo que el bloque gasta arriba y abajo: relleno de 4 + borde de 1.
 */
const LINEA = 14;
const RELLENO = 10;

/**
 * El día en el escritorio: una columna por barbero, el alto de cada cita según lo que dura, lo
 * que está fuera del horario en gris, los bloqueos rayados y la línea de "ahora". Tocar una cita
 * abre su detalle al lado (?cita=) sin salir de la agenda; tocar un hueco lleva a agendar ahí.
 */
export function GrillaDelDia({
  columnas,
  rango,
  horas,
  ahora,
  seleccionada,
}: {
  columnas: ColumnaDeBarbero[];
  rango: Tramo;
  /** Etiquetas del costado: una por hora entera del rango. */
  horas: { minuto: number; texto: string }[];
  /** Minuto del día de "ahora", solo en el día de hoy. */
  ahora?: { minuto: number; texto: string } | undefined;
  seleccionada?: string | undefined;
}) {
  const alto = px(rango.fin - rango.inicio);
  const arriba = (minuto: number) => px(minuto - rango.inicio);
  const ahoraVisible = ahora && ahora.minuto >= rango.inicio && ahora.minuto <= rango.fin ? ahora : undefined;
  const oculta = (c: ColumnaDeBarbero) => (c.sinTurno ? 'hidden group-data-[todos=si]/turnos:block' : '');
  const lineasDeHora = {
    backgroundImage: `repeating-linear-gradient(to bottom, var(--color-borde) 0 1px, transparent 1px ${px(60)})`,
  };

  return (
    // Se desplaza por dentro (alto de la pantalla): así los nombres de los barberos quedan fijos arriba.
    <div id="grilla-del-dia" className="max-h-[calc(100dvh-13rem)] min-h-96 overflow-auto rounded-xl border border-borde bg-superficie">
      {ahoraVisible && <LlevarAAhora contenedor="grilla-del-dia" linea="grilla-ahora" />}
      {/* --columnas la pone BarberosSinTurno: cuántas se ven ahora. Las escondidas no ocupan lugar. */}
      <div className="grid" style={{ gridTemplateColumns: `4.5rem repeat(var(--columnas, ${columnas.length}), minmax(10rem, 1fr))` }}>
        <div className="sticky top-0 z-20 border-b border-borde bg-superficie" />
        {columnas.map((c) => (
          <div key={c.id} className={`sticky top-0 z-20 border-b border-l border-borde bg-superficie px-3 py-2.5 text-sm font-semibold break-words ${oculta(c)}`}>
            {c.nombre}
          </div>
        ))}

        <div aria-hidden className="relative" style={{ height: alto }}>
          {horas.map((h) => (
            <span
              key={h.minuto}
              className={`absolute right-2 -translate-y-1/2 text-xs whitespace-nowrap text-suave tabular-nums first:translate-y-0 ${horaTapada(h.minuto, ahoraVisible?.minuto) ? 'invisible' : ''}`}
              style={{ top: arriba(h.minuto) }}
            >
              {h.texto}
            </span>
          ))}
          {ahoraVisible && (
            <span id="grilla-ahora" className="absolute right-1 z-10 -translate-y-1/2 rounded bg-marca px-1 text-[0.6875rem] font-semibold whitespace-nowrap text-white tabular-nums" style={{ top: arriba(ahoraVisible.minuto) }}>
              {ahoraVisible.texto}
            </span>
          )}
        </div>

        {columnas.map((c) => (
          <div key={c.id} role="group" aria-label={`Agenda de ${c.nombre}`} className={`relative border-l border-borde bg-hundido ${oculta(c)}`} style={{ height: alto }}>
            {c.trabajo.map((t) => (
              <div key={`t${t.inicio}`} aria-hidden className="absolute inset-x-0 bg-superficie" style={{ top: arriba(t.inicio), height: px(t.fin - t.inicio) }} />
            ))}
            <div aria-hidden className="pointer-events-none absolute inset-0" style={lineasDeHora} />

            {c.bloqueos.map((b) => (
              <div
                key={b.clave}
                className="absolute inset-x-1 overflow-hidden rounded-md border border-borde px-2 py-1 text-xs text-suave"
                style={{
                  top: arriba(b.tramo.inicio),
                  height: px(b.tramo.fin - b.tramo.inicio),
                  backgroundImage: 'repeating-linear-gradient(135deg, var(--color-hundido) 0 6px, var(--color-fondo) 6px 12px)',
                }}
              >
                <span className="font-medium">Bloqueado</span> · {b.motivo}
              </div>
            ))}

            {c.huecos.map((h) => (
              <Link
                key={h.clave}
                href={h.href}
                aria-label={h.etiqueta}
                className="group absolute inset-x-1 flex items-start rounded-md px-2 py-1 text-xs font-semibold text-marca opacity-0 transition-opacity duration-150 hover:bg-marca-suave hover:opacity-100 focus-visible:bg-marca-suave focus-visible:opacity-100"
                style={{ top: arriba(h.tramo.inicio), height: px(h.tramo.fin - h.tramo.inicio) }}
              >
                + Agendar desde las {h.hora}
              </Link>
            ))}

            {c.citas.map((cita) => {
              const alta = Math.max((cita.tramo.fin - cita.tramo.inicio) * PX_POR_MINUTO, 22);
              const elegida = cita.id === seleccionada;
              // El nombre no se corta: pasa a la línea siguiente, y los servicios usan las que sobren.
              const lineas = Math.max(1, Math.floor((alta - RELLENO) / LINEA));
              return (
                <Link
                  key={cita.id}
                  href={cita.href}
                  scroll={false}
                  aria-label={cita.etiqueta}
                  aria-current={elegida ? 'true' : undefined}
                  title={cita.etiqueta}
                  className={`absolute inset-x-1 z-[1] overflow-hidden rounded-md border border-l-4 border-borde bg-superficie px-2 py-1 text-xs shadow-sm transition-shadow duration-150 hover:shadow-flotante ${
                    ESTADOS[cita.estado].franja
                  } ${elegida ? 'ring-2 ring-marca' : ''}`}
                  style={{ top: arriba(cita.tramo.inicio), height: `${alta}px` }}
                >
                  {/* Alto justo de las líneas que caben: lo que sobra se corta entre líneas, sin "…" que haga parecer cortado el nombre. */}
                  <span className="block overflow-hidden leading-3.5 break-words" style={{ maxHeight: `${lineas * LINEA}px` }}>
                    <span className="cifras font-semibold">{cita.hora}</span> <span className="font-medium">{cita.cliente}</span>
                    <br />
                    <span className="text-suave">{cita.servicios}</span>
                  </span>
                </Link>
              );
            })}

            {ahoraVisible && <div aria-hidden className="pointer-events-none absolute inset-x-0 z-[2] h-0.5 bg-marca" style={{ top: arriba(ahoraVisible.minuto) }} />}
          </div>
        ))}
      </div>
    </div>
  );
}
