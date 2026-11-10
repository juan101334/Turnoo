'use client';

import { KeyRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { EstadoFormulario } from '@/lib/acciones';
import { CLAVE_MIN } from '@/lib/claves';
import { CampoContrasena } from './formulario';
import { FormularioConEstado } from './formulario-con-estado';

/**
 * La contraseña en Cuenta: una fila "Contraseña · •••••••• · Cambiar". El formulario solo se abre
 * cuando la persona lo pide, y se cierra al cancelar o al cambiarla (con el aviso de éxito).
 * Al abrir, el foco va a "Contraseña actual"; al cerrar, vuelve a "Cambiar".
 */
export function SeccionContrasena({
  accion,
  ayuda,
}: {
  accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  ayuda: string;
}) {
  const [abierta, setAbierta] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const volverAlBoton = useRef(false);
  const cerrar = () => {
    volverAlBoton.current = true;
    setAbierta(false);
  };
  // Ya pintada la fila otra vez, el foco vuelve al botón que abrió el formulario.
  useEffect(() => {
    if (abierta || !volverAlBoton.current) return;
    volverAlBoton.current = false;
    boton.current?.focus();
  }, [abierta]);
  return (
    <section aria-labelledby="titulo-contrasena" className="mb-4 rounded-xl border border-borde bg-superficie p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="titulo-contrasena" className="flex items-center gap-2 font-semibold">
          <KeyRound aria-hidden className="size-5 text-marca" />
          Contraseña
        </h2>
        {!abierta && (
          <>
            <span aria-hidden className="cifras flex-1 tracking-widest text-suave">
              ••••••••
            </span>
            <button
              ref={boton}
              type="button"
              onClick={() => setAbierta(true)}
              aria-expanded={false}
              aria-controls="formulario-contrasena"
              aria-label="Cambiar contraseña"
              className="ml-auto min-h-11 cursor-pointer rounded-lg px-3 font-semibold text-marca transition-colors duration-150 hover:bg-marca-suave"
            >
              Cambiar
            </button>
          </>
        )}
      </div>
      {abierta && (
        <div id="formulario-contrasena" className="mt-3">
          <p className="mb-3 text-sm text-suave">{ayuda}</p>
          <FormularioConEstado limpiar accion={accion} boton="Cambiar contraseña" enviando="Cambiando…" alListo={cerrar} cancelar={cerrar}>
            <CampoContrasena id="actual" name="actual" etiqueta="Contraseña actual" autoComplete="current-password" required autoFocus />
            <CampoContrasena id="nueva" name="nueva" etiqueta="Contraseña nueva" ayuda={`Mínimo ${CLAVE_MIN} caracteres.`} autoComplete="new-password" minLength={CLAVE_MIN} required />
            <CampoContrasena id="confirmacion" name="confirmacion" etiqueta="Repite la contraseña nueva" autoComplete="new-password" required />
          </FormularioConEstado>
        </div>
      )}
    </section>
  );
}
