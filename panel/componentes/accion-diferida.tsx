'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EstadoAccion } from '@/app/(panel)/citas/acciones';
import { TIEMPO_PARA_DESHACER, useAvisar } from './avisos-flotantes';

interface AccionDiferida {
  /** Citas sobre las que la persona ya actuó en esta pantalla (aún sin respuesta o ya guardadas). */
  hechas: ReadonlySet<string>;
  hacer: (citaId: string, cliente: string) => void;
}

const Contexto = createContext<AccionDiferida>({ hechas: new Set(), hacer: () => {} });

export const useAccionDiferida = () => useContext(Contexto);

/**
 * Una acción sobre citas con "Deshacer" ("Completada" en la agenda, "Aprobar" en por aprobar).
 * El backend no permite volver atrás (una cita completada no vuelve a pendiente; una aprobada ya
 * le avisó al cliente), así que el panel espera a que se acabe el aviso (7 s) para mandarla;
 * mientras tanto la pantalla ya muestra el cambio. Si la persona sale de la pantalla o la oculta,
 * se manda en ese momento. Si el backend la rechaza, todo vuelve a como estaba y se avisa el error.
 */
export function ProveedorDeAccionDiferida({
  accion,
  aviso,
  children,
}: {
  accion: (citaId: string) => Promise<EstadoAccion>;
  /** Texto del aviso con "Deshacer": 'Completada: Juan Pérez.'. */
  aviso: (cliente: string) => string;
  children: ReactNode;
}) {
  const [hechas, setHechas] = useState<ReadonlySet<string>>(new Set());
  const enEspera = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const avisar = useAvisar();

  const quitar = useCallback((citaId: string) => {
    setHechas((actuales) => {
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
        const resultado = await accion(citaId);
        if (resultado.error) {
          quitar(citaId);
          avisar(resultado.error, { tipo: 'error' });
        }
      } catch {
        quitar(citaId);
        avisar('No se pudo guardar el cambio. Revisa la conexión e inténtalo de nuevo.', { tipo: 'error' });
      }
    },
    [accion, avisar, quitar],
  );

  const hacer = useCallback(
    (citaId: string, cliente: string) => {
      if (enEspera.current.has(citaId)) return;
      setHechas((actuales) => new Set(actuales).add(citaId));
      enEspera.current.set(
        citaId,
        setTimeout(() => void enviar(citaId), TIEMPO_PARA_DESHACER),
      );
      avisar(aviso(cliente), {
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
    [aviso, avisar, enviar, quitar],
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

  const valor = useMemo(() => ({ hechas, hacer }), [hechas, hacer]);
  return <Contexto value={valor}>{children}</Contexto>;
}
