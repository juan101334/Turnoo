import { ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ICONOS } from '@/componentes/iconos';
import { SECCIONES, SECCIONES_DE_MAS, puedeVer } from '@/lib/navegacion';
import { exigirUsuario } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Más' };

/** En el celular, el dueño encuentra aquí lo que no cabe en la barra inferior. */
export default async function PaginaMas() {
  const usuario = await exigirUsuario('mas');
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Más</h1>
      <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
        {SECCIONES_DE_MAS.filter((clave) => puedeVer(usuario.rol, clave)).map((clave) => {
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
    </>
  );
}
