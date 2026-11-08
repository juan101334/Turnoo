'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SECCIONES, SECCIONES_DE_MAS, type ClaveSeccion } from '@/lib/navegacion';
import { ICONOS } from './iconos';

/** La pestaña está activa en su ruta y en las que cuelgan de ella; "Más" también en sus secciones. */
function activa(clave: ClaveSeccion, ruta: string): boolean {
  const propia = SECCIONES[clave].ruta;
  if (ruta === propia || ruta.startsWith(`${propia}/`)) return true;
  // El detalle, la nueva cita y reprogramar cuelgan de la agenda.
  if (clave === 'agenda' && ruta.startsWith('/citas/')) return true;
  return clave === 'mas' && SECCIONES_DE_MAS.some((s) => ruta === SECCIONES[s].ruta || ruta.startsWith(`${SECCIONES[s].ruta}/`));
}

/** Barra inferior del celular. Se oculta desde 1024 px, donde está la lateral. */
export function NavInferior({ pestanas }: { pestanas: ClaveSeccion[] }) {
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
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs transition-colors duration-150 ${
                  esActiva ? 'font-semibold text-marca' : 'text-suave hover:text-texto'
                }`}
              >
                <Icono aria-hidden className="size-6" strokeWidth={esActiva ? 2.4 : 1.8} />
                <span className="max-w-full truncate">{SECCIONES[clave].etiqueta}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Barra lateral del escritorio, con todas las secciones del rol. */
export function NavLateral({ secciones }: { secciones: ClaveSeccion[] }) {
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
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150 ${
                  esActiva ? 'bg-marca-suave font-semibold text-marca-oscura' : 'text-suave hover:bg-fondo hover:text-texto'
                }`}
              >
                <Icono aria-hidden className="size-5" />
                {SECCIONES[clave].etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
