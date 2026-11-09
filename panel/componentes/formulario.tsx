'use client';

import { useFormStatus } from 'react-dom';
import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

/** Si el formulario está enviando. null fuera de <EnvioSinReinicio> (ahí se usa useFormStatus). */
const ContextoEnvio = createContext<boolean | null>(null);

/**
 * React 19 vacía un <form action> después de cada envío: si el backend rechazaba un dato, había
 * que escribir todo de nuevo. Con este onSubmit, ya cargada la página, se envía sin vaciar; antes
 * de que cargue el JavaScript sigue funcionando el atributo action. Va junto con <EnvioSinReinicio>,
 * que le cuenta al botón que se está enviando.
 */
export function alEnviarSinReinicio(enviar: (datos: FormData) => void) {
  return (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    startTransition(() => enviar(datos));
  };
}

export function EnvioSinReinicio({ pendiente, children }: { pendiente: boolean; children: ReactNode }) {
  return <ContextoEnvio value={pendiente}>{children}</ContextoEnvio>;
}

/**
 * Formulario de una Server Action que no se vacía al terminar (ver alEnviarSinReinicio).
 * `limpiarSi` vacía los campos cuando conviene (al agregar algo) y `alTerminar` recibe cada resultado.
 */
export function Formulario<E extends object>({
  accion,
  inicial,
  limpiarSi,
  alTerminar,
  className,
  noValidate,
  children,
}: {
  accion: (previo: E, datos: FormData) => Promise<E>;
  inicial: E;
  limpiarSi?: (estado: E) => boolean;
  alTerminar?: (estado: E) => void;
  className?: string;
  noValidate?: boolean;
  children: ReactNode | ((estado: E) => ReactNode);
}) {
  const [estado, enviar, pendiente] = useActionState<E, FormData>(accion, inicial as Awaited<E>);
  const formulario = useRef<HTMLFormElement>(null);
  const anterior = useRef(estado);

  useEffect(() => {
    if (estado === anterior.current) return;
    anterior.current = estado;
    if (limpiarSi?.(estado)) formulario.current?.reset();
    alTerminar?.(estado);
  }, [estado, limpiarSi, alTerminar]);

  return (
    <ContextoEnvio value={pendiente}>
      <form ref={formulario} action={enviar} onSubmit={alEnviarSinReinicio(enviar)} className={className} noValidate={noValidate}>
        {typeof children === 'function' ? children(estado) : children}
      </form>
    </ContextoEnvio>
  );
}

/** Campo con etiqueta siempre visible, ayuda y error debajo. 16 px: el iPhone no hace zoom. */
export function Campo({
  etiqueta,
  ayuda,
  error,
  id,
  ...input
}: { etiqueta: string; ayuda?: string; error?: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  const idError = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={[idAyuda, idError].filter(Boolean).join(' ') || undefined}
        className="min-h-11 rounded-lg border border-borde bg-superficie px-3 text-base aria-invalid:border-peligro"
        {...input}
      />
      {ayuda && (
        <p id={idAyuda} className="text-sm text-suave">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className="text-sm text-peligro">
          {error}
        </p>
      )}
    </div>
  );
}

/** Lista desplegable con etiqueta visible y ayuda debajo, igual que Campo. */
export function CampoSeleccion({
  etiqueta,
  ayuda,
  id,
  children,
  ...select
}: { etiqueta: string; ayuda?: string; id: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      <select
        id={id}
        aria-describedby={ayuda ? `${id}-ayuda` : undefined}
        className="min-h-11 rounded-lg border border-borde bg-superficie px-3 text-base"
        {...select}
      >
        {children}
      </select>
      {ayuda && (
        <p id={`${id}-ayuda`} className="text-sm text-suave">
          {ayuda}
        </p>
      )}
    </div>
  );
}

const ESTILOS = {
  primario: 'bg-marca text-white hover:bg-marca-oscura',
  secundario: 'border border-borde bg-superficie text-texto hover:bg-fondo',
  peligro: 'bg-peligro text-white hover:opacity-90',
} as const;

/** Si el formulario que contiene al componente se está enviando (para botones propios). */
export function useEnvioPendiente(): boolean {
  const deFormulario = useContext(ContextoEnvio);
  const { pending: nativo } = useFormStatus();
  return deFormulario ?? nativo;
}

/** Botón de envío: se desactiva y avisa mientras el formulario se procesa. */
export function BotonEnviar({ children, enviando, variante = 'primario' }: { children: ReactNode; enviando: string; variante?: keyof typeof ESTILOS }) {
  const pending = useEnvioPendiente();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`min-h-11 w-full cursor-pointer rounded-lg px-4 font-semibold transition-colors duration-150 disabled:cursor-wait disabled:opacity-70 ${ESTILOS[variante]}`}
    >
      {pending ? enviando : children}
    </button>
  );
}
