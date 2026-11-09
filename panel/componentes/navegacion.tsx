'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SECCIONES, SECCIONES_DE_MAS, textoDelContador, type ClaveSeccion, type Contadores, type Grupo } from '@/lib/navegacion';
import type { Tema } from '@/lib/tema';
import { ICONOS } from './iconos';
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

function EnlaceLateral({ clave, ruta, n }: { clave: ClaveSeccion; ruta: string; n: number | undefined }) {
  const Icono = ICONOS[clave];
  const esActiva = activa(clave, ruta);
  return (
    <Link
      href={SECCIONES[clave].ruta}
      aria-current={esActiva ? 'page' : undefined}
      aria-label={nombreAccesible(clave, n)}
      title={SECCIONES[clave].etiqueta}
      className={`relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[0.6875rem] leading-tight transition-colors duration-150 lg:min-h-10 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm ${
        esActiva ? 'bg-marca-suave font-semibold text-marca-oscura' : 'text-suave hover:bg-hundido hover:text-texto'
      }`}
    >
      <Icono aria-hidden className="size-5 shrink-0" strokeWidth={esActiva ? 2.3 : 1.8} />
      <span className="max-w-full truncate text-center lg:hidden">{SECCIONES[clave].corta ?? SECCIONES[clave].etiqueta}</span>
      <span className="hidden flex-1 truncate lg:block">{SECCIONES[clave].etiqueta}</span>{' '}
      <Contador n={n} className="absolute top-1 right-2 lg:static" />
    </Link>
  );
}

/**
 * Menú lateral: en tablet (768 a 1023 px) solo íconos con su nombre corto debajo; desde 1024 px,
 * completo y agrupado. Al pie, el tema y "Cuenta".
 */
export function NavLateral({
  grupos,
  conCuenta,
  contadores = {},
  tema,
}: {
  grupos: Grupo[];
  conCuenta: boolean;
  contadores?: Contadores;
  tema: Tema;
}) {
  const ruta = usePathname();
  return (
    <nav aria-label="Principal" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 pb-4 lg:gap-5 lg:px-3">
        {grupos.map((g) => (
          <div key={g.titulo}>
            <p className="mb-1 hidden px-3 text-xs font-semibold tracking-wide text-suave uppercase lg:block">{g.titulo}</p>
            <hr className="mx-3 mb-2 border-borde lg:hidden" />
            <ul className="flex flex-col gap-0.5">
              {g.secciones.map((clave) => (
                <li key={clave}>
                  <EnlaceLateral clave={clave} ruta={ruta} n={contadores[clave]} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1 border-t border-borde p-2 lg:gap-2 lg:p-3">
        <BotonDeTema tema={tema} className="mx-auto lg:hidden" />
        <div className="hidden lg:block">
          <SelectorDeTema tema={tema} variante="iconos" />
        </div>
        {conCuenta && <EnlaceLateral clave="cuenta" ruta={ruta} n={undefined} />}
      </div>
    </nav>
  );
}
