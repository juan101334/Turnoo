import Link from 'next/link';
import { CitaEnLaGrilla, type CitaDeLaGrilla } from './cita-en-la-grilla';
import { HuecoDeLaGrilla, type MarcaDelHueco } from './hueco-de-la-grilla';
import { LlevarAAhora } from './llevar-a-ahora';
import { horaTapada, type Tramo } from '@/lib/agenda';

/** 15 minutos = 20 px: un corte de 30 min alcanza para la hora y el nombre. */
const PX_POR_MINUTO = 20 / 15;
const px = (minutos: number) => `${minutos * PX_POR_MINUTO}px`;

export interface BloqueDeCita extends CitaDeLaGrilla {
  tramo: Tramo;
}

export interface ColumnaDeBarbero {
  id: string;
  nombre: string;
  trabajo: Tramo[];
  citas: BloqueDeCita[];
  bloqueos: { clave: string; tramo: Tramo; motivo: string }[];
  /** Cada hueco con sus franjas: la primera es su inicio (el destino con el teclado). */
  huecos: { clave: string; tramo: Tramo; etiqueta: string; marcas: MarcaDelHueco[] }[];
  /** No trabaja ese día: su columna se esconde hasta "Mostrar todos" (ver BarberosSinTurno). */
  sinTurno?: boolean;
  /** En la semana: el encabezado (el día) lleva a la vista de ese día; `actual` lo marca. */
  encabezado?: { href: string; actual: boolean; etiqueta: string };
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
 * abre su detalle al lado (?cita=) sin salir de la agenda; tocar un hueco agenda a la hora de la
 * franja tocada (ver HuecoDeLaGrilla).
 */
export function GrillaDelDia({
  columnas,
  rango,
  horas,
  ahora,
  seleccionada,
  anchoMinimo = '10rem',
}: {
  columnas: ColumnaDeBarbero[];
  rango: Tramo;
  /** Etiquetas del costado: una por hora entera del rango. */
  horas: { minuto: number; texto: string }[];
  /** Minuto del día de "ahora", solo en el día de hoy. En la semana, `columna` es la de hoy. */
  ahora?: { minuto: number; texto: string; columna?: string } | undefined;
  seleccionada?: string | undefined;
  /** Ancho mínimo de cada columna: en la semana son 7 y van más angostas. */
  anchoMinimo?: string;
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
      <div className="grid" style={{ gridTemplateColumns: `4.5rem repeat(var(--columnas, ${columnas.length}), minmax(${anchoMinimo}, 1fr))` }}>
        <div className="sticky top-0 z-20 border-b border-borde bg-superficie" />
        {columnas.map((c) => (
          <div key={c.id} className={`sticky top-0 z-20 border-b border-l border-borde bg-superficie text-sm font-semibold break-words ${c.encabezado ? '' : 'px-3 py-2.5'} ${oculta(c)}`}>
            {c.encabezado ? (
              <Link
                href={c.encabezado.href}
                aria-current={c.encabezado.actual ? 'date' : undefined}
                className={`flex min-h-11 items-center px-3 capitalize transition-colors duration-150 hover:bg-fondo ${c.encabezado.actual ? 'text-marca underline decoration-2 underline-offset-4' : ''}`}
              >
                {c.nombre}
                {/* El nombre empieza con lo que se ve ("lun 16") y sigue con la fecha completa. */}
                <span className="sr-only">, {c.encabezado.etiqueta}</span>
              </Link>
            ) : (
              c.nombre
            )}
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
          <div key={c.id} role="group" aria-label={c.encabezado ? `Agenda del ${c.encabezado.etiqueta}` : `Agenda de ${c.nombre}`} className={`relative border-l border-borde bg-hundido ${oculta(c)}`} style={{ height: alto }}>
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
              <HuecoDeLaGrilla
                key={h.clave}
                marcas={h.marcas}
                etiqueta={h.etiqueta}
                pxPorMinuto={PX_POR_MINUTO}
                style={{ top: arriba(h.tramo.inicio), height: px(h.tramo.fin - h.tramo.inicio) }}
              />
            ))}

            {c.citas.map((cita) => {
              const alto = Math.max((cita.tramo.fin - cita.tramo.inicio) * PX_POR_MINUTO, 22);
              // El nombre no se corta: pasa a la línea siguiente, y los servicios usan las que sobren.
              const lineas = Math.max(1, Math.floor((alto - RELLENO) / LINEA));
              return <CitaEnLaGrilla key={cita.id} cita={cita} elegida={cita.id === seleccionada} arriba={arriba(cita.tramo.inicio)} alto={alto} lineas={lineas} />;
            })}

            {ahoraVisible && (ahoraVisible.columna === undefined || ahoraVisible.columna === c.id) && (
              <div aria-hidden className="pointer-events-none absolute inset-x-0 z-[2] h-0.5 bg-marca" style={{ top: arriba(ahoraVisible.minuto) }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
