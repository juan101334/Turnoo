'use client';

import { LoaderCircle, Search } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';

/** Espera desde la última letra antes de buscar. */
export const ESPERA_BUSQUEDA_MS = 300;

/**
 * Búsqueda que muestra resultados mientras se escribe. Todas las búsquedas del panel usan esta.
 *
 * - Espera 300 ms desde la última letra: cada letra reinicia la cuenta, así no se pide una
 *   búsqueda por letra. Enter busca de una vez.
 * - La búsqueda queda en la URL (?buscar=) con router.replace: se puede compartir, recargar y
 *   volver atrás, sin llenar el historial con una entrada por letra. Quita ?pagina=: una
 *   búsqueda nueva empieza en la primera página. El resto de la URL se conserva.
 * - Respuestas viejas: los resultados los pinta el servidor en la navegación. Si llega otra
 *   búsqueda antes de que termine la anterior, el enrutador de Next descarta la vieja y solo
 *   muestra la última, así que no hace falta un AbortController propio (no hay fetch nuestro
 *   que cancelar). Lo comprueba e2e/busqueda.spec.ts.
 * - Mientras espera o busca, la lupa del campo gira, y "Buscando…" para el lector.
 * - Sin JavaScript sigue siendo un formulario GET normal (children lleva los campos ocultos).
 */
export function BuscadorEnVivo({
  id,
  etiqueta,
  placeholder,
  inicial,
  children,
  className = '',
}: {
  id: string;
  etiqueta: string;
  placeholder: string;
  /** Lo que dice ?buscar= en la URL ahora. */
  inicial: string;
  /** Campos ocultos para el envío sin JavaScript. */
  children?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const [texto, setTexto] = useState(inicial);
  const [esperando, setEsperando] = useState(false);
  const [cargando, iniciar] = useTransition();
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  // La URL cambió por fuera (atrás, un enlace): el campo la sigue, salvo mientras se escribe.
  useEffect(() => {
    if (!esperando && !cargando) setTexto((actual) => (actual.trim() === inicial ? actual : inicial));
    // Solo cuando cambia la URL; el estado de la escritura se lee en ese momento.
  }, [inicial]);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  function buscar(valor: string) {
    clearTimeout(temporizador.current);
    setEsperando(false);
    // La URL de este momento, no la de cuando se empezó a escribir.
    const consulta = new URLSearchParams(window.location.search);
    const limpio = valor.trim().slice(0, 100);
    if (limpio) consulta.set('buscar', limpio);
    else consulta.delete('buscar');
    consulta.delete('pagina');
    const destino = consulta.size > 0 ? `${ruta}?${consulta}` : ruta;
    iniciar(() => router.replace(destino, { scroll: false }));
  }

  const buscando = esperando || cargando;
  return (
    <form
      action={ruta}
      role="search"
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        buscar(texto);
      }}
    >
      {children}
      <label htmlFor={id} className="sr-only">
        {etiqueta}
      </label>
      <div className="relative">
        {/* La lupa se vuelve un círculo que gira mientras busca (a la derecha está la X del navegador). */}
        {buscando ? (
          <LoaderCircle
            aria-hidden
            data-buscando
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 animate-spin text-marca motion-reduce:animate-none"
          />
        ) : (
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-suave" />
        )}
        <input
          id={id}
          name="buscar"
          type="search"
          value={texto}
          onChange={(e) => {
            const valor = e.target.value;
            setTexto(valor);
            setEsperando(true);
            clearTimeout(temporizador.current);
            temporizador.current = setTimeout(() => buscar(valor), ESPERA_BUSQUEDA_MS);
          }}
          placeholder={placeholder}
          maxLength={100}
          autoComplete="off"
          aria-busy={buscando}
          className="min-h-11 w-full rounded-lg border border-borde bg-superficie pr-3 pl-10 text-base"
        />
      </div>
      <span role="status" className="sr-only">
        {buscando ? 'Buscando…' : ''}
      </span>
    </form>
  );
}
