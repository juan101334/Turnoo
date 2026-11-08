'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SECCIONES, SECCIONES_DE_MAS, textoDelContador, type ClaveSeccion, type Contadores } from '@/lib/navegacion';
import { ICONOS } from './iconos';

/** La pestaña está activa en su ruta y en las que cuelgan de ella; "Más" también en sus secciones. */
function activa(clave: ClaveSeccion, ruta: string): boolean {
  const propia = SECCIONES[clave].ruta;
  if (ruta === propia || ruta.startsWith(`${propia}/`)) return true;
  // El detalle, la nueva cita y reprogramar cuelgan de la agenda.
  if (clave === 'agenda' && ruta.startsWith('/citas/')) return true;
  return clave === 'mas' && SECCIONES_DE_MAS.some((s) => ruta === SECCIONES[s].ruta || ruta.startsWith(`${SECCIONES[s].ruta}/`));
}

/** Círculo con el número. Es solo visual: el texto para el lector de pantalla va en la etiqueta. */
function Contador({ n, className }: { n: number | undefined; className: string }) {
  const texto = textoDelContador(n);
  if (!texto) return null;
  return (
    <span aria-hidden className={`min-w-5 rounded-full bg-peligro px-1.5 text-center text-xs leading-5 font-semibold text-white tabular-nums ${className}`}>
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

/** Barra inferior del celular. Se oculta desde 1024 px, donde está la lateral. */
export function NavInferior({ pestanas, contadores = {} }: { pestanas: ClaveSeccion[]; contadores?: Contadores }) {
  const ruta = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-borde bg-superficie pb-[env(safe-area-inset-bottom)] lg:hidden"
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
                <span className="max-w-full truncate">{SECCIONES[clave].etiqueta}</span>
                <Contador n={contadores[clave]} className="absolute top-1 left-1/2 ml-1.5" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Barra lateral del escritorio, con todas las secciones del rol. */
export function NavLateral({ secciones, contadores = {} }: { secciones: ClaveSeccion[]; contadores?: Contadores }) {
  const ruta = usePathname();
  return (
    <nav aria-label="Principal" className="hidden lg:block">
      <ul className="flex flex-col gap-0.5">
        {secciones.map((clave) => {
          const Icono = ICONOS[clave];
          const esActiva = activa(clave, ruta);
          return (
            <li key={clave}>
              <Link
                href={SECCIONES[clave].ruta}
                aria-current={esActiva ? 'page' : undefined}
                aria-label={nombreAccesible(clave, contadores[clave])}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150 ${
                  esActiva ? 'bg-marca-suave font-semibold text-marca-oscura' : 'text-suave hover:bg-fondo hover:text-texto'
                }`}
              >
                <Icono aria-hidden className="size-5" />
                <span className="flex-1">{SECCIONES[clave].etiqueta}</span>
                <Contador n={contadores[clave]} className="" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
