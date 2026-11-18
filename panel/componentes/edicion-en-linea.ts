'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Una fila de Cuenta que se abre para editar ("Nombre · Juan · Cambiar"): el formulario solo se
 * abre cuando la persona lo pide. Al cerrar (cancelar o guardar), el foco vuelve al botón que lo
 * abrió, ya pintada la fila otra vez.
 */
export function useEdicionEnLinea() {
  const [abierta, setAbierta] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const volverAlBoton = useRef(false);
  const cerrar = () => {
    volverAlBoton.current = true;
    setAbierta(false);
  };
  useEffect(() => {
    if (abierta || !volverAlBoton.current) return;
    volverAlBoton.current = false;
    boton.current?.focus();
  }, [abierta]);
  return { abierta, abrir: () => setAbierta(true), cerrar, boton };
}

/** El botón "Cambiar" de la fila, con el mismo aspecto en todas. */
export const ESTILO_BOTON_CAMBIAR =
  'ml-auto min-h-11 cursor-pointer rounded-lg px-3 font-semibold text-marca transition-colors duration-150 hover:bg-marca-suave';
