'use client';

import { useActionState, type ReactNode } from 'react';
import type { EstadoAccion } from '@/app/(panel)/citas/acciones';
import { Aviso } from './aviso';
import { BotonEnviar } from './formulario';

/**
 * Formulario que llama a una Server Action y muestra su error arriba del botón. El contenido
 * (campos) se pinta en el servidor y llega como children.
 */
export function FormularioConEstado({
  accion,
  boton,
  enviando,
  children,
}: {
  accion: (previo: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;
  boton: string;
  enviando: string;
  children: ReactNode;
}) {
  const [estado, enviar] = useActionState(accion, {});
  return (
    <form action={enviar} className="flex flex-col gap-4">
      {children}
      {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <BotonEnviar enviando={enviando}>{boton}</BotonEnviar>
    </form>
  );
}
