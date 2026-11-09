'use client';

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useSyncExternalStore } from 'react';
import { COOKIE_TEMA, DURACION_COOKIE_TEMA, ETIQUETAS_TEMA, leerTema, TEMAS, type Tema } from '@/lib/tema';

const ICONOS_TEMA: Record<Tema, LucideIcon> = { sistema: Monitor, claro: Sun, oscuro: Moon };

/** El tema vive en <html data-tema>: todos los selectores de la pantalla lo leen de ahí y se ven igual. */
function suscribir(alCambiar: () => void) {
  const observador = new MutationObserver(alCambiar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
  return () => observador.disconnect();
}
const temaDelDocumento = () => leerTema(document.documentElement.dataset.tema);

/**
 * El tema actual y cómo cambiarlo. Cambia al instante (atributo y cookie en el navegador) y luego
 * pide al servidor la pantalla otra vez, para que la barra del navegador tome el color del tema.
 */
function useTema(delServidor: Tema): [Tema, (t: Tema) => void] {
  const router = useRouter();
  const tema = useSyncExternalStore(suscribir, temaDelDocumento, () => delServidor);
  const elegir = (nuevo: Tema) => {
    const segura = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE_TEMA}=${nuevo}; Path=/; Max-Age=${DURACION_COOKIE_TEMA}; SameSite=Lax${segura}`;
    if (nuevo === 'sistema') delete document.documentElement.dataset.tema;
    else document.documentElement.dataset.tema = nuevo;
    router.refresh();
  };
  return [tema, elegir];
}

/**
 * Sistema / Claro / Oscuro como tres botones de radio. "completo" lleva el nombre debajo del
 * ícono (Cuenta, Más); "iconos" solo el ícono, con el nombre para el lector y al pasar el mouse
 * (menú lateral).
 */
export function SelectorDeTema({ tema: delServidor, variante = 'completo' }: { tema: Tema; variante?: 'completo' | 'iconos' }) {
  const [tema, elegir] = useTema(delServidor);
  const nombre = useId();
  const completo = variante === 'completo';
  return (
    <fieldset className="min-w-0">
      <legend className={completo ? 'mb-2 text-sm font-medium' : 'sr-only'}>Tema</legend>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-hundido p-1">
        {TEMAS.map((t) => {
          const Icono = ICONOS_TEMA[t];
          return (
            <label
              key={t}
              title={completo ? undefined : ETIQUETAS_TEMA[t]}
              className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md px-2 text-sm transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-marca ${
                tema === t ? 'bg-superficie font-semibold text-texto shadow-sm ring-1 ring-borde dark:bg-borde-fuerte dark:ring-0' : 'text-suave hover:text-texto'
              }`}
            >
              <input type="radio" name={nombre} value={t} checked={tema === t} onChange={() => elegir(t)} className="sr-only" />
              <Icono aria-hidden className="size-4 shrink-0" />
              <span className={completo ? '' : 'sr-only'}>{ETIQUETAS_TEMA[t]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Un solo botón que pasa al tema siguiente (Sistema → Claro → Oscuro), para donde no caben tres:
 * el menú de la tablet y la barra del superadmin.
 */
export function BotonDeTema({ tema: delServidor, className = '' }: { tema: Tema; className?: string }) {
  const [tema, elegir] = useTema(delServidor);
  const siguiente = TEMAS[(TEMAS.indexOf(tema) + 1) % TEMAS.length]!;
  const Icono = ICONOS_TEMA[tema];
  const texto = `Tema: ${ETIQUETAS_TEMA[tema]}. Cambiar a ${ETIQUETAS_TEMA[siguiente].toLowerCase()}`;
  return (
    <button
      type="button"
      onClick={() => elegir(siguiente)}
      aria-label={texto}
      title={texto}
      className={`flex size-11 cursor-pointer items-center justify-center rounded-lg text-suave transition-colors duration-150 hover:bg-hundido hover:text-texto ${className}`}
    >
      <Icono aria-hidden className="size-5" />
    </button>
  );
}
