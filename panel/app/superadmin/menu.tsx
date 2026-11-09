'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ENLACES = [
  { href: '/superadmin', nombre: 'Negocios', activo: (ruta: string) => ruta === '/superadmin' || ruta.startsWith('/superadmin/negocios') },
  { href: '/superadmin/cuenta', nombre: 'Cuenta', activo: (ruta: string) => ruta.startsWith('/superadmin/cuenta') },
];

export function MenuSuperadmin({ nombre }: { nombre: string }) {
  const ruta = usePathname();
  return (
    <nav aria-label="Principal" className="ml-auto flex items-center gap-1">
      {ENLACES.map((e) => (
        <Link
          key={e.href}
          href={e.href}
          aria-current={e.activo(ruta) ? 'page' : undefined}
          className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-suave hover:bg-hundido hover:text-texto aria-[current=page]:bg-marca-suave aria-[current=page]:text-marca-oscura"
        >
          {e.nombre}
        </Link>
      ))}
      <span className="sr-only">Sesión de {nombre}</span>
    </nav>
  );
}
