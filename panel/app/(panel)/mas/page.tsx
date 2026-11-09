import { ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ICONOS } from '@/componentes/iconos';
import { SelectorDeTema } from '@/componentes/selector-de-tema';
import { gruposDeMas, SECCIONES } from '@/lib/navegacion';
import { exigirUsuario } from '@/lib/sesion';
import { temaElegido } from '@/lib/tema-servidor';

export const metadata: Metadata = { title: 'Más' };

/** En el celular, el dueño encuentra aquí lo que no cabe en la barra inferior, con los grupos del menú lateral. */
export default async function PaginaMas() {
  const usuario = await exigirUsuario('mas');
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold">Más</h1>
      <div className="flex flex-col gap-5">
        {gruposDeMas(usuario.rol).map((g) => (
          <section key={g.titulo} aria-labelledby={`grupo-${g.titulo}`}>
            <h2 id={`grupo-${g.titulo}`} className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-suave uppercase">
              {g.titulo}
            </h2>
            <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie">
              {g.secciones.map((clave) => {
                const Icono = ICONOS[clave];
                return (
                  <li key={clave}>
                    <Link href={SECCIONES[clave].ruta} className="flex min-h-14 items-center gap-3 px-4 transition-colors duration-150 hover:bg-fondo">
                      <Icono aria-hidden className="size-5 text-suave" />
                      <span className="flex-1">{SECCIONES[clave].etiqueta}</span>
                      <ChevronRight aria-hidden className="size-5 text-suave" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <section aria-label="Apariencia" className="rounded-xl border border-borde bg-superficie p-4">
          <SelectorDeTema tema={await temaElegido()} />
        </section>
      </div>
    </div>
  );
}
