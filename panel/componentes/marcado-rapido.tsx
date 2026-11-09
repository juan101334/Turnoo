'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { completarCita } from '@/app/(panel)/citas/acciones';
import { TIEMPO_PARA_DESHACER, useAvisar } from './avisos-flotantes';

interface Marcado {
  /** Citas que la persona marcó como completadas en esta pantalla (aún sin respuesta o ya guardadas). */
  marcadas: ReadonlySet<string>;
  completar: (citaId: string, cliente: string) => void;
}

const Contexto = createContext<Marcado>({ marcadas: new Set(), completar: () => {} });

export const useMarcado = () => useContext(Contexto);

/**
 * "Completada" desde la tarjeta, con deshacer. El backend no deja volver una cita a "pendiente",
 * así que el panel espera a que se acabe el aviso (7 s) para mandarla; mientras tanto la tarjeta
 * ya se ve completada. Si la persona sale de la pantalla o la oculta, se manda en ese momento.
 * Si el backend la rechaza, la tarjeta vuelve a como estaba y se avisa el error.
 */
export function ProveedorDeMarcado({ children }: { children: ReactNode }) {
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set());
  const enEspera = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const avisar = useAvisar();

  const quitar = useCallback((citaId: string) => {
    setMarcadas((actuales) => {
      const nuevas = new Set(actuales);
      nuevas.delete(citaId);
      return nuevas;
    });
  }, []);

  const enviar = useCallback(
    async (citaId: string) => {
      const reloj = enEspera.current.get(citaId);
      if (reloj === undefined) return;
      clearTimeout(reloj);
      enEspera.current.delete(citaId);
      try {
        const resultado = await completarCita(citaId);
        if (resultado.error) {
          quitar(citaId);
          avisar(resultado.error, { tipo: 'error' });
        }
      } catch {
        quitar(citaId);
        avisar('No se pudo marcar la cita. Revisa la conexión e inténtalo de nuevo.', { tipo: 'error' });
      }
    },
    [avisar, quitar],
  );

  const completar = useCallback(
    (citaId: string, cliente: string) => {
      if (enEspera.current.has(citaId)) return;
      setMarcadas((actuales) => new Set(actuales).add(citaId));
      enEspera.current.set(
        citaId,
        setTimeout(() => void enviar(citaId), TIEMPO_PARA_DESHACER),
      );
      avisar(`Completada: ${cliente}.`, {
        accion: {
          etiqueta: 'Deshacer',
          hacer: () => {
            clearTimeout(enEspera.current.get(citaId));
            enEspera.current.delete(citaId);
            quitar(citaId);
          },
        },
      });
    },
    [avisar, enviar, quitar],
  );

  // Al ocultar la pantalla (bloquear el celular, cambiar de app) o salir de ella, se manda ya.
  useEffect(() => {
    const pendientes = enEspera.current;
    const mandarTodo = () => {
      for (const citaId of [...pendientes.keys()]) void enviar(citaId);
    };
    const alOcultar = () => {
      if (document.visibilityState === 'hidden') mandarTodo();
    };
    document.addEventListener('visibilitychange', alOcultar);
    window.addEventListener('pagehide', mandarTodo);
    return () => {
      document.removeEventListener('visibilitychange', alOcultar);
      window.removeEventListener('pagehide', mandarTodo);
      mandarTodo();
    };
  }, [enviar]);

  const valor = useMemo(() => ({ marcadas, completar }), [marcadas, completar]);
  return <Contexto value={valor}>{children}</Contexto>;
}
