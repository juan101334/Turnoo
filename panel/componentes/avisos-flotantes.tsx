'use client';

import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Tipo = 'exito' | 'error' | 'info';

interface Opciones {
  tipo?: Tipo;
  /** Un botón en el aviso, por ejemplo "Deshacer". */
  accion?: { etiqueta: string; hacer: () => void };
}

interface AvisoFlotante extends Opciones {
  id: number;
  texto: string;
}

type Avisar = (texto: string, opciones?: Opciones) => void;

const Contexto = createContext<Avisar>(() => {});

/** Muestra un aviso breve abajo de la pantalla (encima de la barra en el celular). */
export function useAvisar(): Avisar {
  return useContext(Contexto);
}

const ICONOS = { exito: CircleCheck, error: CircleAlert, info: Info } as const;
/** Con un botón dura más: hay que alcanzar a tocarlo. */
const DURACION = { simple: 4000, conAccion: 7000 };
/** Lo que dura un aviso con "Deshacer": hasta entonces se puede arrepentir. */
export const TIEMPO_PARA_DESHACER = DURACION.conAccion;
const MAXIMO = 3;

/**
 * Avisos breves para confirmar que algo salió bien ("Cita marcada como completada"). Los errores
 * que hay que corregir siguen junto al campo; aquí van los resultados. La región es role="status"
 * y existe desde el principio, así el lector de pantalla anuncia cada aviso.
 */
export function ProveedorDeAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<AvisoFlotante[]>([]);
  const siguiente = useRef(0);

  const quitar = useCallback((id: number) => setAvisos((lista) => lista.filter((a) => a.id !== id)), []);

  const avisar = useCallback<Avisar>(
    (texto, opciones = {}) => {
      const id = ++siguiente.current;
      setAvisos((lista) => [...lista.slice(-(MAXIMO - 1)), { id, texto, ...opciones }]);
      setTimeout(() => quitar(id), opciones.accion ? DURACION.conAccion : DURACION.simple);
    },
    [quitar],
  );

  return (
    <Contexto value={avisar}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2 px-4 md:right-6 md:bottom-6 md:left-auto md:items-end md:px-0"
      >
        {avisos.map((a) => {
          const Icono = ICONOS[a.tipo ?? 'exito'];
          return (
            <div
              key={a.id}
              className="pointer-events-auto flex w-full max-w-sm animate-entrar items-center gap-3 rounded-lg bg-texto py-2 pr-2 pl-4 text-sm text-white shadow-flotante"
            >
              <Icono aria-hidden className={`size-5 shrink-0 ${a.tipo === 'error' ? 'text-red-300' : a.tipo === 'info' ? 'text-sky-300' : 'text-emerald-300'}`} />
              <p className="min-w-0 flex-1 py-1.5">{a.texto}</p>
              {a.accion && (
                <button
                  type="button"
                  onClick={() => {
                    a.accion!.hacer();
                    quitar(a.id);
                  }}
                  className="min-h-11 shrink-0 cursor-pointer rounded-md px-3 font-semibold text-sky-200 hover:bg-white/10"
                >
                  {a.accion.etiqueta}
                </button>
              )}
              <button
                type="button"
                onClick={() => quitar(a.id)}
                aria-label="Cerrar aviso"
                className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Contexto>
  );
}
