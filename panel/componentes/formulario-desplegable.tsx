'use client';

import { Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { EstadoAccion } from '@/app/(panel)/citas/acciones';
import { FormularioConEstado } from './formulario-con-estado';

/**
 * Un formulario para agregar algo que no ocupa la pantalla hasta que se pide: un botón "Nuevo …"
 * lo abre y "Cancelar" lo cierra. Al agregar queda abierto y vacío, por si van varios seguidos
 * (servicios, rangos de horario); la lista de arriba ya muestra lo agregado.
 *
 * Al abrir, el foco va al primer campo; al cerrar, vuelve al botón que lo abrió (como la
 * contraseña en Cuenta). Con `abierto`, empieza abierto: cuando la lista está vacía, agregar es
 * lo único que hay que hacer.
 */
export function FormularioDesplegable({
  abrir,
  titulo,
  nivel = 3,
  ayuda,
  abierto: abiertoAlInicio = false,
  accion,
  boton,
  enviando,
  variante,
  children,
}: {
  /** Texto del botón que lo abre: "Nuevo servicio". */
  abrir: string;
  /** Encabezado del formulario abierto: "Agregar servicio". */
  titulo: string;
  /** Nivel del encabezado: 2 si va suelto en la página, 3 dentro de una sección. */
  nivel?: 2 | 3;
  ayuda?: string;
  abierto?: boolean;
  accion: (previo: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;
  boton: string;
  enviando: string;
  variante?: 'primario' | 'secundario';
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(abiertoAlInicio);
  const id = useId();
  const contenido = useRef<HTMLDivElement>(null);
  const botonAbrir = useRef<HTMLButtonElement>(null);
  // Solo se mueve el foco tras un clic de la persona, no al pintar la página.
  const moverFoco = useRef(false);

  useEffect(() => {
    if (!moverFoco.current) return;
    moverFoco.current = false;
    if (abierto) contenido.current?.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea')?.focus();
    else botonAbrir.current?.focus();
  }, [abierto]);

  const cambiar = (valor: boolean) => {
    moverFoco.current = true;
    setAbierto(valor);
  };

  const Titulo = nivel === 2 ? 'h2' : 'h3';

  if (!abierto) {
    return (
      <button
        ref={botonAbrir}
        type="button"
        onClick={() => cambiar(true)}
        aria-expanded={false}
        aria-controls={id}
        className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-borde px-4 text-sm font-semibold text-marca transition-colors duration-150 hover:border-marca hover:bg-marca-suave"
      >
        <Plus aria-hidden className="size-4" />
        {abrir}
      </button>
    );
  }

  return (
    <div ref={contenido} id={id} role="group" aria-labelledby={`${id}-titulo`} className="rounded-xl border border-borde bg-superficie p-3">
      <Titulo id={`${id}-titulo`} className="text-sm font-semibold">
        {titulo}
      </Titulo>
      {ayuda && <p className="text-sm text-suave">{ayuda}</p>}
      <div className="mt-3">
        <FormularioConEstado limpiar accion={accion} boton={boton} enviando={enviando} cancelar={() => cambiar(false)} {...(variante && { variante })}>
          {children}
        </FormularioConEstado>
      </div>
    </div>
  );
}
