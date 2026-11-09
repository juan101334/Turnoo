'use client';

import type { ReactNode } from 'react';
import type { EstadoAccion } from '@/app/(panel)/citas/acciones';
import { Aviso } from './aviso';
import { useAvisar } from './avisos-flotantes';
import { BotonEnviar, Formulario } from './formulario';

const sinError = (e: EstadoAccion) => Boolean(e.listo);

/**
 * Formulario que llama a una Server Action: el error se muestra arriba del botón (junto a lo que
 * hay que corregir) y el éxito, en un aviso breve. Lo escrito no se pierde si el backend rechaza
 * algo; con `limpiar`, los campos se vacían al guardar (formularios para agregar).
 */
export function FormularioConEstado({
  accion,
  boton,
  enviando,
  children,
  variante,
  limpiar = false,
}: {
  accion: (previo: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;
  boton: string;
  enviando: string;
  children: ReactNode;
  variante?: 'primario' | 'secundario';
  limpiar?: boolean;
}) {
  const avisar = useAvisar();
  return (
    <Formulario<EstadoAccion>
      accion={accion}
      inicial={{}}
      className="flex flex-col gap-4"
      {...(limpiar && { limpiarSi: sinError })}
      alTerminar={(e) => {
        if (e.listo) avisar(e.listo);
      }}
    >
      {(estado) => (
        <>
          {children}
          {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
          <BotonEnviar enviando={enviando} {...(variante && { variante })}>
            {boton}
          </BotonEnviar>
        </>
      )}
    </Formulario>
  );
}
