import type { ReactNode } from 'react';

/**
 * Esqueletos de carga con la forma real de cada pantalla: al tocar un enlace, la pantalla cambia
 * enseguida aunque el servidor tarde. Con "reducir movimiento" quedan quietos (globals.css).
 */

function Bloque({ className }: { className: string }) {
  return <div className={`animate-latido rounded-md bg-hundido ${className}`} />;
}

function Cargando({ children, ancho = 'max-w-2xl' }: { children: ReactNode; ancho?: string }) {
  return (
    <div aria-busy="true" className={`mx-auto w-full ${ancho}`}>
      <p className="sr-only" role="status">
        Cargando…
      </p>
      {children}
    </div>
  );
}

function Encabezado({ conAccion = false }: { conAccion?: boolean }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div className="flex flex-col gap-2">
        <Bloque className="h-3.5 w-24" />
        <Bloque className="h-7 w-40" />
      </div>
      {conAccion && <Bloque className="hidden h-11 w-36 rounded-lg md:block" />}
    </div>
  );
}

/** Hoy y Agenda: encabezado, fila de días y tarjetas de citas (desde 1024 px, la grilla). */
export function EsqueletoAgenda({ conTira = true }: { conTira?: boolean }) {
  return (
    <Cargando ancho="max-w-4xl lg:max-w-none">
      <Encabezado conAccion />
      {conTira && (
        <div className="mb-5 flex gap-2 overflow-hidden">
          {Array.from({ length: 9 }, (_, i) => (
            <Bloque key={i} className="h-14 w-14 shrink-0 rounded-xl" />
          ))}
        </div>
      )}
      <div className="hidden h-[36rem] grid-cols-[4.5rem_repeat(3,1fr)] overflow-hidden rounded-xl border border-borde bg-superficie lg:grid">
        <div />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 border-l border-borde p-3">
            <Bloque className="h-4 w-28" />
            <Bloque className={`h-16 w-full ${i === 1 ? 'mt-24' : 'mt-8'}`} />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 lg:hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex min-h-20 items-start gap-4 rounded-xl border border-borde bg-superficie p-3">
            <Bloque className="h-6 w-20" />
            <div className="flex flex-1 flex-col gap-2">
              <Bloque className="h-4 w-2/3" />
              <Bloque className="h-3.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </Cargando>
  );
}

/** Listas: clientes, usuarios, bloqueos, mensajes, por aprobar… */
export function EsqueletoLista({ filas = 6, conBuscador = false, conAccion = false }: { filas?: number; conBuscador?: boolean; conAccion?: boolean }) {
  return (
    <Cargando>
      <Encabezado conAccion={conAccion} />
      {conBuscador && <Bloque className="mb-4 h-11 w-full rounded-lg" />}
      <div className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie">
        {Array.from({ length: filas }, (_, i) => (
          <div key={i} className="flex min-h-16 flex-col justify-center gap-2 px-4 py-3">
            <Bloque className="h-4 w-1/2" />
            <Bloque className="h-3.5 w-1/3" />
          </div>
        ))}
      </div>
    </Cargando>
  );
}

/** Fichas: una cita, un cliente, un barbero. */
export function EsqueletoDetalle() {
  return (
    <Cargando>
      <Bloque className="mb-4 h-5 w-28" />
      <div className="mb-4 rounded-xl border border-borde bg-superficie p-4">
        <Bloque className="mb-2 h-8 w-40" />
        <Bloque className="mb-5 h-4 w-56" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-4">
              <Bloque className="h-4 w-20" />
              <Bloque className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Bloque className="h-11 rounded-lg" />
        <Bloque className="h-11 rounded-lg" />
      </div>
    </Cargando>
  );
}

/** Formularios: nueva cita, editar, invitar, ajustes… */
export function EsqueletoFormulario({ campos = 4 }: { campos?: number }) {
  return (
    <Cargando>
      <Bloque className="mb-4 h-5 w-24" />
      <Bloque className="mb-5 h-7 w-48" />
      <div className="flex flex-col gap-5">
        {Array.from({ length: campos }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Bloque className="h-4 w-28" />
            <Bloque className="h-11 w-full rounded-lg" />
          </div>
        ))}
        <Bloque className="h-11 w-full rounded-lg" />
      </div>
    </Cargando>
  );
}

/** Una conversación: burbujas alternadas y el campo para responder. */
export function EsqueletoConversacion() {
  return (
    <Cargando>
      <Bloque className="mb-4 h-5 w-24" />
      <Bloque className="mb-5 h-7 w-44" />
      <div className="mb-5 flex flex-col gap-3">
        {['self-start w-3/5', 'self-end w-1/2', 'self-start w-2/5', 'self-end w-3/5'].map((c, i) => (
          <Bloque key={i} className={`h-14 rounded-2xl ${c}`} />
        ))}
      </div>
      <Bloque className="h-28 w-full rounded-xl" />
    </Cargando>
  );
}
