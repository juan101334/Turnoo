'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { debeAvisar, esIOS, MARCA_CENTINELA, navegaAqui } from '@/lib/cambios-sin-guardar';
import { DialogoConfirmar } from './dialogo-confirmar';

/**
 * Aviso al salir de una pantalla con cambios sin guardar. Las pantallas solo dicen si tienen
 * cambios (useCambiosSinGuardar); este proveedor, uno por marco, decide y pregunta:
 * - Recargar o cerrar la pestaña: beforeunload (el aviso es del navegador y su texto no se puede
 *   cambiar). El iPhone no lo muestra: ahí la pantalla dice, junto al botón de guardar, que
 *   recargar o cerrar pierde lo escrito.
 * - Clic en un enlace del panel: se atrapa antes que Next (fase de captura) y se pregunta con un
 *   diálogo propio.
 * - Atrás del navegador: mientras hay cambios, arriba del historial va una entrada "centinela" con
 *   la misma dirección. Ir atrás la saca: el popstate se atrapa antes que Next y se pregunta.
 *   Al quedar sin cambios (guardar o descartar), el centinela se quita.
 * Lo que la propia pantalla hace después de guardar (redirigir) no pregunta: mientras envía,
 * la pantalla dice que no tiene cambios.
 */

interface Fuente {
  sucia: boolean;
  /** Un destino que no pierde lo escrito (en Ajustes, otra sección del mismo formulario). */
  esSegura?: ((destino: URL) => boolean) | undefined;
  /** Si ir atrás desde aquí tampoco pierde nada (en Ajustes del celular, volver a la lista). */
  atrasSeguro?: (() => boolean) | undefined;
}

interface Guardia {
  registrar: (id: string, fuente: Fuente | null) => void;
  sinAvisoAlCerrar: boolean;
  /** Agrega una entrada al historial sin perder el centinela (navegación dentro de la pantalla). */
  apilar: (url: string, estado: Record<string, unknown>) => void;
  /** Cambia la dirección sin agregar historial ni perder el centinela (pestañas de Ajustes). */
  reemplazar: (url: string) => void;
}

const ContextoGuardia = createContext<Guardia | null>(null);

const conMarca = () => Boolean((window.history.state as Record<string, unknown> | null)?.[MARCA_CENTINELA]);
function sinMarca(estado: unknown): Record<string, unknown> {
  const copia = { ...((estado as Record<string, unknown> | null) ?? {}) };
  delete copia[MARCA_CENTINELA];
  return copia;
}
/** El centinela copia el estado de Next (__NA y su árbol): si no, Next recarga la página al volver. */
function ponerCentinela() {
  window.history.pushState({ ...((window.history.state as object | null) ?? {}), [MARCA_CENTINELA]: true }, '', window.location.href);
}

type Pregunta = { alSalir: () => void; alSeguir: () => void };

/** Lo pone el proveedor montado (hay uno por marco); sin proveedor, no hay centinela. */
let soltarDelProveedor: ((despues: () => void) => void) | null = null;

/**
 * Antes de enviar un formulario: quita el centinela y después envía. Si se quitara mientras se
 * envía, el paso atrás (asíncrono) podría cruzarse con la redirección de la acción y deshacerla.
 * Si el envío falla, el formulario sigue con cambios y el centinela vuelve.
 */
export function soltarCentinela(despues: () => void) {
  if (soltarDelProveedor) soltarDelProveedor(despues);
  else despues();
}

export function GuardiaDeSalida({ children }: { children: ReactNode }) {
  const router = useRouter();
  const fuentes = useRef(new Map<string, Fuente>());
  const [hayCambios, setHayCambios] = useState(false);
  const [pregunta, setPregunta] = useState<Pregunta | null>(null);
  const [ios, setIos] = useState(false);

  /** Saliendo con permiso: no se vuelve a preguntar (ni beforeunload). */
  const saliendo = useRef(false);
  /** El próximo popstate es nuestro (quitar el centinela): Next no debe enterarse. */
  const quitando = useRef<null | (() => void)>(null);
  /** El próximo popstate es una salida o un paso permitido: que lo maneje Next. */
  const pasar = useRef(false);
  /** Si la entrada actual del historial es un centinela. */
  const marcada = useRef(false);
  /**
   * La dirección que se ve. La pantalla puede cambiarla sin agregar historial (pestañas de
   * Ajustes) y eso solo toca el centinela: al quitarlo, la entrada de abajo se corrige con esta.
   */
  const visible = useRef('');
  const poner = useCallback(() => {
    if (!conMarca()) ponerCentinela();
    visible.current = window.location.href;
    marcada.current = true;
  }, []);
  /** Ya en la entrada de abajo del centinela: que muestre la misma dirección que se ve. */
  const corregirDireccion = () => {
    if (visible.current && window.location.href !== visible.current) window.history.replaceState(window.history.state, '', visible.current);
  };

  useEffect(() => setIos(esIOS(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)), []);

  const registrar = useCallback((id: string, fuente: Fuente | null) => {
    if (fuente) fuentes.current.set(id, fuente);
    else fuentes.current.delete(id);
    setHayCambios([...fuentes.current.values()].some((f) => f.sucia));
  }, []);

  const sucias = () => [...fuentes.current.values()].filter((f) => f.sucia);
  const destinoSeguro = (destino: URL) => sucias().every((f) => f.esSegura?.(destino) ?? false);

  /** Quita el centinela (un paso atrás que Next no ve) y luego hace `despues`. */
  const quitarCentinela = useCallback((despues: () => void = () => {}) => {
    if (!conMarca()) return despues();
    quitando.current = despues;
    window.history.back();
  }, []);

  useEffect(() => {
    soltarDelProveedor = (despues) => {
      marcada.current = false;
      quitarCentinela(despues);
    };
    return () => {
      soltarDelProveedor = null;
    };
  }, [quitarCentinela]);

  // Centinela: puesto mientras hay cambios, quitado al quedar sin ellos.
  useEffect(() => {
    if (hayCambios) {
      saliendo.current = false;
      poner();
    } else if (!saliendo.current) {
      quitarCentinela();
    }
  }, [hayCambios, poner, quitarCentinela]);

  useEffect(() => {
    if (!hayCambios) return;

    function alDescargar(e: BeforeUnloadEvent) {
      if (saliendo.current) return;
      e.preventDefault();
      // Chrome viejo y Safari de escritorio piden returnValue para mostrar el aviso.
      e.returnValue = '';
    }

    function alHacerClic(e: MouseEvent) {
      if (saliendo.current || e.defaultPrevented) return;
      const enlace = (e.target as Element | null)?.closest?.('a[href]');
      if (!(enlace instanceof HTMLAnchorElement)) return;
      const clic = { boton: e.button, conTecla: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey, target: enlace.target, descarga: enlace.hasAttribute('download') };
      if (!navegaAqui(clic)) return;
      const destino = new URL(enlace.href, window.location.href);
      if (!debeAvisar(destino, new URL(window.location.href), destinoSeguro)) return;
      // Antes que Next: ni el <Link> ni el navegador navegan.
      e.preventDefault();
      e.stopPropagation();
      setPregunta({
        alSeguir: () => {},
        alSalir: () => {
          saliendo.current = true;
          quitarCentinela(() => router.push(destino.pathname + destino.search + destino.hash));
        },
      });
    }

    window.addEventListener('beforeunload', alDescargar);
    document.addEventListener('click', alHacerClic, { capture: true });
    return () => {
      window.removeEventListener('beforeunload', alDescargar);
      document.removeEventListener('click', alHacerClic, { capture: true });
    };
    // destinoSeguro lee las fuentes al momento del clic.
  }, [hayCambios, quitarCentinela, router]);

  // Atrás y adelante. Siempre escuchando: también hay que atrapar el paso que quita el centinela
  // después de guardar, cuando ya no hay cambios.
  useEffect(() => {
    /**
     * Después de un paso atrás permitido dentro de la pantalla (en Ajustes del celular, de una
     * sección a la lista), los cambios siguen: el centinela vuelve arriba. Se pone en la vuelta
     * siguiente, cuando Next ya atendió el popstate. Saliendo, no.
     */
    function reponerCentinela() {
      setTimeout(() => {
        if (saliendo.current || sucias().length === 0 || conMarca()) return;
        poner();
      }, 0);
    }

    function alVolver(e: PopStateEvent) {
      const veniaDeCentinela = marcada.current;
      marcada.current = Boolean((e.state as Record<string, unknown> | null)?.[MARCA_CENTINELA]);
      if (quitando.current) {
        const despues = quitando.current;
        quitando.current = null;
        e.stopImmediatePropagation();
        corregirDireccion();
        despues();
        return;
      }
      if (pasar.current) {
        pasar.current = false;
        reponerCentinela();
        return;
      }
      if (saliendo.current || sucias().length === 0 || marcada.current) return;

      if (veniaDeCentinela) {
        // Atrás desde la pantalla: se salió del centinela y la dirección es la misma.
        e.stopImmediatePropagation();
        corregirDireccion();
        if (sucias().every((f) => f.atrasSeguro?.() ?? false)) {
          pasar.current = true;
          window.history.back();
          return;
        }
        setPregunta({
          alSeguir: poner,
          alSalir: () => {
            saliendo.current = true;
            pasar.current = true;
            window.history.back();
          },
        });
        return;
      }

      // Sin centinela de por medio (varios pasos atrás de una vez): ya se está en el destino.
      const destino = new URL(window.location.href);
      if (destinoSeguro(destino)) return reponerCentinela();
      e.stopImmediatePropagation();
      setPregunta({
        alSeguir: () => {
          pasar.current = true;
          window.history.forward();
        },
        alSalir: () => {
          saliendo.current = true;
          window.location.replace(destino.href);
        },
      });
    }
    // En captura: en el mismo objetivo (window), los de captura van antes que el de Next, y
    // stopImmediatePropagation lo deja sin enterarse. Lo prueba e2e/cambios-sin-guardar.spec.ts.
    window.addEventListener('popstate', alVolver, { capture: true });
    return () => window.removeEventListener('popstate', alVolver, { capture: true });
    // Solo refs y funciones que leen las fuentes al momento del evento.
  }, []);

  const apilar = useCallback(
    (url: string, estado: Record<string, unknown>) => {
      window.history.pushState({ ...sinMarca(window.history.state), ...estado }, '', url);
      marcada.current = false;
      visible.current = window.location.href;
      if (hayCambios) poner();
    },
    [hayCambios, poner],
  );

  const reemplazar = useCallback((url: string) => {
    // Con el estado de Next (y la marca, si es el centinela): Next no se entera, la pantalla sí.
    window.history.replaceState({ ...((window.history.state as object | null) ?? {}) }, '', url);
    visible.current = window.location.href;
  }, []);

  const responder = (salir: boolean) => {
    const p = pregunta;
    setPregunta(null);
    if (p) (salir ? p.alSalir : p.alSeguir)();
  };

  return (
    <ContextoGuardia value={{ registrar, sinAvisoAlCerrar: ios, apilar, reemplazar }}>
      {children}
      <DialogoConfirmar
        abierto={pregunta !== null}
        titulo="¿Salir sin guardar?"
        confirmar="Salir sin guardar"
        cancelar="Seguir editando"
        peligro
        alConfirmar={() => responder(true)}
        alCancelar={() => responder(false)}
      >
        <p>Los cambios que hiciste en esta pantalla se pierden.</p>
      </DialogoConfirmar>
    </ContextoGuardia>
  );
}

/**
 * Para cualquier pantalla con formulario: mientras `hayCambios`, salir pregunta antes. Devuelve
 * si este navegador no avisa al recargar o cerrar (iPhone), para decirlo en la pantalla.
 */
export function useCambiosSinGuardar(hayCambios: boolean, opciones: Omit<Fuente, 'sucia'> = {}): { sinAvisoAlCerrar: boolean } {
  const guardia = useContext(ContextoGuardia);
  const id = useId();
  const esSegura = useRef(opciones.esSegura);
  const atrasSeguro = useRef(opciones.atrasSeguro);
  esSegura.current = opciones.esSegura;
  atrasSeguro.current = opciones.atrasSeguro;

  const registrar = guardia?.registrar;
  useEffect(() => {
    registrar?.(id, { sucia: hayCambios, esSegura: (d) => esSegura.current?.(d) ?? false, atrasSeguro: () => atrasSeguro.current?.() ?? false });
  }, [registrar, id, hayCambios]);
  useEffect(() => () => registrar?.(id, null), [registrar, id]);

  return { sinAvisoAlCerrar: Boolean(guardia?.sinAvisoAlCerrar && hayCambios) };
}

/** Cambiar la dirección dentro de la misma pantalla, sin historial ni romper el aviso (ver Ajustes). */
export function useReemplazarEnHistorial(): (url: string) => void {
  const guardia = useContext(ContextoGuardia);
  return guardia?.reemplazar ?? ((url) => window.history.replaceState({ ...((window.history.state as object | null) ?? {}) }, '', url));
}

/** Agregar una entrada al historial dentro de la misma pantalla sin romper el aviso (ver Ajustes). */
export function useApilarEnHistorial(): (url: string, estado: Record<string, unknown>) => void {
  const guardia = useContext(ContextoGuardia);
  return guardia?.apilar ?? ((url, estado) => window.history.pushState({ ...sinMarca(window.history.state), ...estado }, '', url));
}

// ---------------------------------------------------------------------
// Cambios de un formulario (campos sin controlar, con defaultValue)
// ---------------------------------------------------------------------

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const IGNORADOS = new Set(['submit', 'button', 'reset', 'hidden', 'file', 'image']);

function controles(formulario: HTMLFormElement): Control[] {
  return [...formulario.elements].filter(
    (e): e is Control => (e instanceof HTMLInputElement && !IGNORADOS.has(e.type)) || e instanceof HTMLSelectElement || e instanceof HTMLTextAreaElement,
  ).filter((e) => e.name !== '');
}

function cambio(e: Control): boolean {
  if (e instanceof HTMLInputElement && (e.type === 'checkbox' || e.type === 'radio')) return e.checked !== e.defaultChecked;
  if (e instanceof HTMLSelectElement) {
    // Al reiniciar, queda la opción marcada por defecto; si no hay, la primera.
    const opciones = [...e.options];
    const inicial = opciones.find((o) => o.defaultSelected) ?? opciones[0];
    return e.value !== (inicial?.value ?? '');
  }
  return e.value !== e.defaultValue;
}

/** Los campos que cambiaron respecto de lo que trajo la página, y lo que tiene cada uno ahora. */
export function leerCambios(formulario: HTMLFormElement): { cambiados: string[]; valores: Record<string, string> } {
  const cambiados = new Set<string>();
  const valores: Record<string, string> = {};
  for (const e of controles(formulario)) {
    if (cambio(e)) cambiados.add(e.name);
    if (!(e instanceof HTMLInputElement && (e.type === 'checkbox' || e.type === 'radio')) || e.checked) valores[e.name] = e.value;
  }
  return { cambiados: [...cambiados], valores };
}

/**
 * Lo escrito pasa a ser lo guardado: después de guardar sin salir de la pantalla, ya no hay
 * cambios. Con `valores`, solo esos campos y con lo que devolvió el backend (que normaliza).
 */
export function fijarValores(formulario: HTMLFormElement, valores?: Record<string, string>) {
  for (const e of controles(formulario)) {
    if (valores && !(e.name in valores)) continue;
    if (valores && !(e instanceof HTMLInputElement && (e.type === 'checkbox' || e.type === 'radio'))) e.value = valores[e.name]!;
    if (e instanceof HTMLInputElement && (e.type === 'checkbox' || e.type === 'radio')) e.defaultChecked = e.checked;
    else if (e instanceof HTMLSelectElement) for (const o of e.options) o.defaultSelected = o.selected;
    else e.defaultValue = e.value;
  }
}

/** Sigue los cambios de un formulario mientras se escribe (y al reiniciarlo). */
export function useCambiosDelFormulario(formulario: RefObject<HTMLFormElement | null>) {
  const [estado, setEstado] = useState<{ cambiados: string[]; valores: Record<string, string> }>({ cambiados: [], valores: {} });
  const revisar = useCallback(() => {
    if (formulario.current) setEstado(leerCambios(formulario.current));
  }, [formulario]);

  useEffect(() => {
    const f = formulario.current;
    if (!f) return;
    revisar();
    // "reset" llega antes de que se borren los valores: se revisa en la vuelta siguiente.
    const alReiniciar = () => setTimeout(revisar, 0);
    f.addEventListener('input', revisar);
    f.addEventListener('change', revisar);
    f.addEventListener('reset', alReiniciar);
    return () => {
      f.removeEventListener('input', revisar);
      f.removeEventListener('change', revisar);
      f.removeEventListener('reset', alReiniciar);
    };
  }, [formulario, revisar]);

  return { ...estado, revisar };
}

/** Nota para el iPhone, junto al botón de guardar: ahí recargar o cerrar no pregunta. */
export function NotaSinAvisoAlCerrar() {
  return <p className="text-sm text-aviso">En este iPhone, recargar o cerrar la página no avisa: guarda antes de salir.</p>;
}
