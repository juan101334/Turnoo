'use client';

import { UserRound } from 'lucide-react';
import type { EstadoFormulario } from '@/lib/acciones';
import { ESTILO_BOTON_CAMBIAR, useEdicionEnLinea } from './edicion-en-linea';
import { Campo } from './formulario';
import { FormularioConEstado } from './formulario-con-estado';

/**
 * El perfil en Cuenta: el nombre se cambia en la misma fila ("Nombre · Juan · Cambiar"), como la
 * contraseña. Correo, rol y negocio solo se muestran.
 */
export function SeccionPerfil({
  nombre,
  datos,
  accion,
  ayuda,
}: {
  nombre: string;
  /** Lo que no se edita: correo, rol y, si hay, el negocio. */
  datos: { etiqueta: string; valor: string }[];
  accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  ayuda: string;
}) {
  const { abierta, abrir, cerrar, boton } = useEdicionEnLinea();
  return (
    <section aria-labelledby="titulo-perfil" className="mb-4 rounded-xl border border-borde bg-superficie p-4">
      <h2 id="titulo-perfil" className="mb-3 flex items-center gap-2 font-semibold">
        <UserRound aria-hidden className="size-5 text-marca" />
        Perfil
      </h2>
      {abierta ? (
        <div id="formulario-nombre">
          <FormularioConEstado accion={accion} boton="Guardar nombre" enviando="Guardando…" alListo={cerrar} cancelar={cerrar}>
            <Campo id="nombre" name="nombre" etiqueta="Nombre" ayuda={ayuda} defaultValue={nombre} autoComplete="name" minLength={2} maxLength={100} required autoFocus />
          </FormularioConEstado>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-suave">Nombre</p>
            <p className="text-lg font-medium break-words">{nombre}</p>
          </div>
          <button
            ref={boton}
            type="button"
            onClick={abrir}
            aria-expanded={false}
            aria-controls="formulario-nombre"
            aria-label="Cambiar nombre"
            className={ESTILO_BOTON_CAMBIAR}
          >
            Cambiar
          </button>
        </div>
      )}
      <dl className="mt-3 flex flex-col gap-3 border-t border-borde pt-3">
        {datos.map((d) => (
          <div key={d.etiqueta}>
            <dt className="text-sm text-suave">{d.etiqueta}</dt>
            <dd className="break-words">{d.valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
