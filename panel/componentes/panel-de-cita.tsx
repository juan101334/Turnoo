import { X } from 'lucide-react';
import Link from 'next/link';
import { accionesPosibles, type Cita } from '@/lib/citas';
import { AccionesCita } from './acciones-cita';
import { AlAbrirElPanel } from './al-abrir-el-panel';
import { DetalleDeCita } from './detalle-de-cita';

/**
 * El detalle de una cita al lado de la grilla, en el escritorio (?cita=id). Se cierra con la X o
 * con Escape; al abrir, el foco va a la hora de la cita para que el teclado y el lector sigan ahí.
 */
export function PanelDeCita({ cita, zona, cerrar }: { cita: Cita | null; zona: string; cerrar: string }) {
  return (
    <aside aria-labelledby="panel-cita-titulo" className="sticky top-6 flex w-80 shrink-0 xl:w-[22rem] animate-entrar flex-col gap-3 self-start">
      <AlAbrirElPanel cerrar={cerrar} enfocar="panel-cita-titulo" clave={cita?.id ?? 'ninguna'} />
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-suave">Detalle de la cita</p>
        <Link href={cerrar} scroll={false} aria-label="Cerrar el detalle" className="flex size-11 items-center justify-center rounded-lg text-suave hover:bg-hundido hover:text-texto">
          <X aria-hidden className="size-5" />
        </Link>
      </div>
      {cita ? (
        <>
          <DetalleDeCita cita={cita} zona={zona} nivel={2} idTitulo="panel-cita-titulo" />
          <AccionesCita citaId={cita.id} acciones={accionesPosibles(cita)} />
          <Link href={`/citas/${cita.id}`} className="text-center text-sm font-medium text-marca hover:underline">
            Abrir en su propia página
          </Link>
        </>
      ) : (
        <p id="panel-cita-titulo" tabIndex={-1} className="rounded-xl border border-dashed border-borde bg-superficie p-4 text-sm text-suave outline-none">
          Esta cita no existe o no es de tu agenda.
        </p>
      )}
    </aside>
  );
}
