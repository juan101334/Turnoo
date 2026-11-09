'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cookieDelMenu } from '@/lib/menu';
import { SECCIONES, SECCIONES_DE_MAS, textoDelContador, type ClaveSeccion, type Contadores, type Grupo } from '@/lib/navegacion';
import type { Tema } from '@/lib/tema';
import { ICONOS } from './iconos';
import { IsotipoTurnoo, LogoTurnoo } from './marca';
import { BotonDeTema, SelectorDeTema } from './selector-de-tema';

/** La sección está activa en su ruta y en las que cuelgan de ella; "Más" también en sus secciones. */
function activa(clave: ClaveSeccion, ruta: string): boolean {
  const propia = SECCIONES[clave].ruta;
  if (ruta === propia || ruta.startsWith(`${propia}/`)) return true;
  // El detalle, la nueva cita y reprogramar cuelgan de la agenda.
  if (clave === 'agenda' && ruta.startsWith('/citas/')) return true;
  return clave === 'mas' && SECCIONES_DE_MAS.some((s) => ruta === SECCIONES[s].ruta || ruta.startsWith(`${SECCIONES[s].ruta}/`));
}

/** Círculo con el número. Es solo visual: el lector de pantalla lo oye en el aria-label del enlace. */
function Contador({ n, className }: { n: number | undefined; className: string }) {
  const texto = textoDelContador(n);
  if (!texto) return null;
  return (
    <span aria-hidden className={`min-w-5 rounded-full bg-peligro px-1.5 text-center text-xs leading-5 font-semibold text-white cifras ${className}`}>
      {texto}
    </span>
  );
}

/**
 * Con pendientes, el enlace se anuncia "Por aprobar, 3 pendientes". Va en aria-label: un texto
 * oculto dentro del enlace hace que el navegador meta un espacio antes de la coma.
 */
function nombreAccesible(clave: ClaveSeccion, n: number | undefined): string | undefined {
  if (!textoDelContador(n)) return undefined;
  return `${SECCIONES[clave].etiqueta}, ${n === 1 ? '1 pendiente' : `${n} pendientes`}`;
}

/** Barra inferior del celular (menos de 768 px): cinco pestañas al alcance del pulgar. */
export function NavInferior({ pestanas, contadores = {} }: { pestanas: ClaveSeccion[]; contadores?: Contadores }) {
  const ruta = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-borde bg-superficie/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {pestanas.map((clave) => {
          const Icono = ICONOS[clave];
          const esActiva = activa(clave, ruta);
          return (
            <li key={clave} className="flex-1">
              <Link
                href={SECCIONES[clave].ruta}
                aria-current={esActiva ? 'page' : undefined}
                aria-label={nombreAccesible(clave, contadores[clave])}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs transition-colors duration-150 ${
                  esActiva ? 'font-semibold text-marca' : 'text-suave hover:text-texto'
                }`}
              >
                <Icono aria-hidden className="size-6" strokeWidth={esActiva ? 2.4 : 1.8} />
                <span className="max-w-full truncate">{SECCIONES[clave].etiqueta}</span>{' '}
                {/* El espacio deja "Por aprobar 2" como texto visible: coincide con el nombre accesible. */}
                <Contador n={contadores[clave]} className="absolute top-1 left-1/2 ml-1.5" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Nombre flotante del menú plegado: el texto y a qué altura de la pantalla va. */
type Rotulo = { texto: string; centro: number } | null;

/** Mostrar u ocultar el nombre flotante de un enlace o botón del menú plegado. */
type AlRotular = (texto: string, elemento: HTMLElement | null) => void;

/** Lo que dispara el nombre flotante: pasar el mouse o llegar con el teclado. */
function eventosDelRotulo(texto: string, rotular: AlRotular | undefined) {
  if (!rotular) return {};
  const mostrar = (e: { currentTarget: HTMLElement }) => rotular(texto, e.currentTarget);
  const ocultar = () => rotular(texto, null);
  return { onMouseEnter: mostrar, onFocus: mostrar, onMouseLeave: ocultar, onBlur: ocultar };
}

function EnlaceLateral({
  clave,
  ruta,
  n,
  plegado,
  rotular,
}: {
  clave: ClaveSeccion;
  ruta: string;
  n: number | undefined;
  plegado: boolean;
  rotular?: AlRotular;
}) {
  const Icono = ICONOS[clave];
  const esActiva = activa(clave, ruta);
  const { etiqueta } = SECCIONES[clave];
  return (
    <Link
      href={SECCIONES[clave].ruta}
      aria-current={esActiva ? 'page' : undefined}
      aria-label={nombreAccesible(clave, n)}
      // En la tablet y en el menú plegado, el nombre completo aparece al pasar el mouse.
      title={plegado ? undefined : etiqueta}
      {...eventosDelRotulo(etiqueta, rotular)}
      className={`relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[0.6875rem] leading-tight transition-colors duration-150 ${
        plegado ? 'lg:mx-auto lg:min-h-11 lg:w-11' : 'lg:min-h-10 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm'
      } ${esActiva ? 'bg-marca-suave font-semibold text-marca-oscura' : 'text-suave hover:bg-hundido hover:text-texto'}`}
    >
      <Icono aria-hidden className="size-5 shrink-0" strokeWidth={esActiva ? 2.3 : 1.8} />
      <span className="max-w-full truncate text-center lg:hidden">{SECCIONES[clave].corta ?? etiqueta}</span>
      {/* Plegado, el nombre no se ve pero el lector de pantalla lo sigue leyendo. */}
      <span className={plegado ? 'hidden lg:block lg:sr-only' : 'hidden flex-1 truncate lg:block'}>{etiqueta}</span>{' '}
      <Contador n={n} className={plegado ? 'absolute top-1 right-2 lg:top-0 lg:-right-1' : 'absolute top-1 right-2 lg:static'} />
    </Link>
  );
}

/**
 * Menú lateral. En la tablet (768 a 1023 px), íconos con su nombre corto debajo. Desde 1024 px,
 * completo y agrupado, o plegado a solo íconos (64 px) con el nombre al pasar el mouse o al
 * llegar con el teclado. Al pie, el tema, "Cuenta" y el botón de plegar.
 *
 * Plegado o abierto se guarda en una cookie (lib/menu.ts): el servidor lo pinta del ancho
 * correcto desde el primer render, sin salto al recargar.
 */
export function MenuLateral({
  grupos,
  conCuenta,
  contadores = {},
  tema,
  plegadoInicial,
}: {
  grupos: Grupo[];
  conCuenta: boolean;
  contadores?: Contadores;
  tema: Tema;
  plegadoInicial: boolean;
}) {
  const ruta = usePathname();
  const [plegado, setPlegado] = useState(plegadoInicial);
  const [rotulo, setRotulo] = useState<Rotulo>(null);
  const ocultarRotulo = useRef<ReturnType<typeof setTimeout>>(undefined);

  // El nombre flotante solo hace falta plegado y en el escritorio: en la tablet el nombre ya se ve.
  const rotular: AlRotular | undefined = plegado
    ? (texto, elemento) => {
        clearTimeout(ocultarRotulo.current);
        if (elemento && matchMedia('(min-width: 1024px)').matches) {
          const caja = elemento.getBoundingClientRect();
          setRotulo({ texto, centro: caja.top + caja.height / 2 });
        } else if (!elemento) {
          // Un respiro para alcanzar el nombre con el mouse sin que desaparezca.
          ocultarRotulo.current = setTimeout(() => setRotulo(null), 100);
        }
      }
    : undefined;

  // Escape cierra el nombre flotante sin mover el foco (WCAG 1.4.13).
  useEffect(() => {
    if (!rotulo) return;
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && setRotulo(null);
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [rotulo]);
  useEffect(() => () => clearTimeout(ocultarRotulo.current), []);

  function alternar() {
    const nuevo = !plegado;
    document.cookie = cookieDelMenu(nuevo, location.protocol === 'https:');
    setPlegado(nuevo);
    setRotulo(null);
  }

  const textoDelBoton = plegado ? 'Abrir menú' : 'Plegar menú';
  const IconoDelBoton = plegado ? PanelLeftOpen : PanelLeftClose;
  return (
    <aside
      data-plegado={plegado ? '' : undefined}
      className={`sticky top-0 hidden h-dvh w-20 shrink-0 flex-col border-r border-borde bg-superficie transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex ${
        plegado ? 'lg:w-16' : 'lg:w-60'
      }`}
    >
      <div className={`px-2 pt-5 pb-4 ${plegado ? '' : 'lg:px-6'}`}>
        <IsotipoTurnoo className={`mx-auto block size-10 ${plegado ? 'lg:size-9' : 'lg:hidden'}`} />
        <LogoTurnoo className={plegado ? 'hidden' : 'hidden h-8 lg:block'} />
      </div>
      <nav id="menu-principal" aria-label="Principal" className="flex min-h-0 flex-1 flex-col">
        <div className={`flex flex-1 flex-col gap-4 overflow-y-auto px-2 pb-4 ${plegado ? '' : 'lg:gap-5 lg:px-3'}`}>
          {grupos.map((g) => (
            <div key={g.titulo}>
              <p className={plegado ? 'hidden' : 'mb-1 hidden px-3 text-xs font-semibold tracking-wide text-suave uppercase lg:block'}>{g.titulo}</p>
              <hr className={`mx-3 mb-2 border-borde ${plegado ? 'lg:mx-2' : 'lg:hidden'}`} />
              <ul className="flex flex-col gap-0.5">
                {g.secciones.map((clave) => (
                  <li key={clave}>
                    <EnlaceLateral clave={clave} ruta={ruta} n={contadores[clave]} plegado={plegado} rotular={rotular} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className={`flex flex-col gap-1 border-t border-borde p-2 ${plegado ? 'items-center' : 'lg:gap-2 lg:p-3'}`}>
          <BotonDeTema tema={tema} className={`mx-auto ${plegado ? '' : 'lg:hidden'}`} />
          <div className={plegado ? 'hidden' : 'hidden lg:block'}>
            <SelectorDeTema tema={tema} variante="iconos" />
          </div>
          {conCuenta && (
            <div className="w-full">
              <EnlaceLateral clave="cuenta" ruta={ruta} n={undefined} plegado={plegado} rotular={rotular} />
            </div>
          )}
        </div>
      </nav>
      {/* Plegar es solo del escritorio: en la tablet el menú ya va angosto. */}
      <div className={`hidden border-t border-borde p-2 lg:flex ${plegado ? 'justify-center' : 'lg:px-3'}`}>
        <button
          type="button"
          onClick={alternar}
          aria-expanded={!plegado}
          aria-controls="menu-principal"
          aria-label={plegado ? textoDelBoton : undefined}
          {...eventosDelRotulo(textoDelBoton, rotular)}
          className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg text-sm text-suave transition-colors duration-150 hover:bg-hundido hover:text-texto ${
            plegado ? 'w-11 justify-center' : 'w-full px-3'
          }`}
        >
          <IconoDelBoton aria-hidden className="size-5 shrink-0" />
          {!plegado && textoDelBoton}
        </button>
      </div>
      {rotulo && (
        // Va fuera de la lista con scroll (que lo recortaría), pegado al borde del menú. Se puede
        // alcanzar con el mouse sin que desaparezca; para el lector, el nombre ya está en el enlace.
        <div
          aria-hidden
          onMouseEnter={() => clearTimeout(ocultarRotulo.current)}
          onMouseLeave={() => setRotulo(null)}
          style={{ top: rotulo.centro }}
          className="fixed left-16 z-50 -translate-y-1/2 pl-2"
        >
          <p data-rotulo className="rounded-md bg-texto px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-fondo shadow-lg">
            {rotulo.texto}
          </p>
        </div>
      )}
    </aside>
  );
}
