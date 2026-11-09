import { CalendarCheck, MessageCircle, Smartphone } from 'lucide-react';
import type { ReactNode } from 'react';
import { IsotipoTurnoo, LogoTurnoo } from '@/componentes/marca';

/**
 * Pantallas sin sesión. En el celular, una tarjeta centrada, cómoda con una mano. Desde 1024 px,
 * la marca a la izquierda (qué es Turnoo, en tres líneas) y el formulario a la derecha.
 */
export default function LayoutAcceso({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-marca px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between dark:bg-marca-suave dark:text-texto">
        {/* En oscuro el panel es azul noche: el logo va en su versión normal. */}
        <LogoTurnoo tono="claro" className="h-10 self-start dark:hidden" />
        <LogoTurnoo className="hidden h-10 self-start dark:block" />
        <div className="max-w-md">
          <p className="mb-8 text-3xl leading-tight font-semibold">La agenda de tu barbería, con WhatsApp que responde solo.</p>
          <ul className="flex flex-col gap-4 text-white/90 dark:text-suave">
            <li className="flex items-start gap-3">
              <CalendarCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
              El día de cada barbero, en el celular o en el PC.
            </li>
            <li className="flex items-start gap-3">
              <MessageCircle aria-hidden className="mt-0.5 size-5 shrink-0" />
              El asistente agenda y contesta; lo que no sabe, te lo pasa.
            </li>
            <li className="flex items-start gap-3">
              <Smartphone aria-hidden className="mt-0.5 size-5 shrink-0" />
              Recordatorios y avisos por WhatsApp, sin apps nuevas para tus clientes.
            </li>
          </ul>
        </div>
        <IsotipoTurnoo tono="claro" decorativo className="pointer-events-none absolute -top-16 -right-28 size-80 opacity-10" />
      </aside>
      <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <LogoTurnoo className="mx-auto mb-6 block h-10 lg:hidden" />
          <div className="rounded-xl border border-borde bg-superficie p-6 shadow-sm">{children}</div>
        </div>
      </div>
    </main>
  );
}
