import type { ReactNode } from 'react';
import { ProveedorDeAvisos } from '@/componentes/avisos-flotantes';
import { GuardiaDeSalida } from '@/componentes/guardia-de-salida';
import { LogoTurnoo } from '@/componentes/marca';
import { SaltarAlContenido } from '@/componentes/saltar-al-contenido';
import { BotonDeTema } from '@/componentes/selector-de-tema';
import { exigirSuperadmin } from '@/lib/sesion-superadmin';
import { temaElegido } from '@/lib/tema-servidor';
import { MenuSuperadmin } from './menu';

/**
 * Panel del superadmin (Turnoo): negocios, sus números de WhatsApp y sus usuarios. Es una
 * herramienta interna de pocas pantallas: una barra arriba en todos los tamaños.
 */
export default async function LayoutSuperadmin({ children }: { children: ReactNode }) {
  const [usuario, tema] = await Promise.all([exigirSuperadmin(), temaElegido()]);
  return (
    <ProveedorDeAvisos>
      <GuardiaDeSalida>
        <SaltarAlContenido />
        <header className="sticky top-0 z-30 border-b border-borde bg-superficie/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-x-4 px-4 py-2">
            <div className="flex items-center gap-2">
              <LogoTurnoo className="h-6 sm:h-7" />
              <span className="hidden rounded-full bg-marca-suave px-2 py-0.5 text-xs font-semibold text-marca-oscura sm:inline">Superadmin</span>
            </div>
            <MenuSuperadmin nombre={usuario.nombre} />
            <BotonDeTema tema={tema} className="-ml-3" />
          </div>
        </header>
        <main id="contenido" tabIndex={-1} className="outline-none mx-auto w-full max-w-5xl px-4 pt-5 pb-16 lg:pt-8">{children}</main>
      </GuardiaDeSalida>
    </ProveedorDeAvisos>
  );
}
