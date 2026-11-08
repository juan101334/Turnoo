'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Aviso } from '@/componentes/aviso';
import { EnlaceParaCompartir } from '@/componentes/enlace-para-compartir';
import { BotonEnviar, Campo, CampoSeleccion } from '@/componentes/formulario';
import { mensajeConEnlace } from '@/lib/administracion';
import { invitarUsuario, type ResultadoEnlace } from '../acciones';

/** Invitar: nombre, correo, rol y con qué barbero atiende. Al terminar, el enlace para compartir. */
export function FormularioInvitacion({ barberos, barberoInicial, negocio }: { barberos: { id: string; nombre: string }[]; barberoInicial: string; negocio: string }) {
  const [estado, enviar] = useActionState<ResultadoEnlace, FormData>(invitarUsuario, {});
  const [rol, setRol] = useState<'empleado' | 'dueno'>('empleado');

  if (estado.enlace) {
    return (
      <div className="flex flex-col gap-4">
        <EnlaceParaCompartir enlace={estado.enlace.url} vence={estado.enlace.vence} mensaje={mensajeConEnlace('invitacion', negocio, estado.enlace.url)} />
        <Link href="/usuarios" className="flex min-h-11 items-center justify-center rounded-lg border border-borde bg-superficie font-semibold hover:bg-fondo">
          Volver a usuarios
        </Link>
      </div>
    );
  }

  return (
    <form action={enviar} className="flex flex-col gap-4">
      <Campo id="nombre" name="nombre" etiqueta="Nombre" required maxLength={100} autoComplete="off" />
      <Campo id="email" name="email" etiqueta="Correo" type="email" required maxLength={254} autoComplete="off" ayuda="Con este correo entrará al panel." />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">Rol</legend>
        {(
          [
            ['empleado', 'Barbero', 'Ve solo su agenda y sus clientes.'],
            ['dueno', 'Dueño', 'Ve y cambia todo, como tú.'],
          ] as const
        ).map(([valor, etiqueta, ayuda]) => (
          <label key={valor} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-borde bg-superficie p-3 has-checked:border-marca has-checked:bg-marca-suave">
            <input type="radio" name="rol" value={valor} checked={rol === valor} onChange={() => setRol(valor)} className="mt-1 size-4 accent-marca" />
            <span>
              <span className="block font-medium">{etiqueta}</span>
              <span className="block text-sm text-suave">{ayuda}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <CampoSeleccion
        id="profesionalId"
        name="profesionalId"
        etiqueta={rol === 'empleado' ? 'Atiende como' : 'Atiende como (si también corta)'}
        defaultValue={barberoInicial}
        required={rol === 'empleado'}
        ayuda={barberos.length === 0 ? 'Todos los barberos ya tienen usuario. Agrega uno en "Barberos y servicios".' : 'Solo aparecen los barberos activos que aún no tienen usuario.'}
      >
        <option value="">{rol === 'empleado' ? 'Elige un barbero' : 'No atiende'}</option>
        {barberos.map((b) => (
          <option key={b.id} value={b.id}>
            {b.nombre}
          </option>
        ))}
      </CampoSeleccion>
      {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <BotonEnviar enviando="Creando enlace…">Crear enlace de invitación</BotonEnviar>
    </form>
  );
}
