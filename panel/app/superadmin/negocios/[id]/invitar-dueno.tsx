'use client';

import { useActionState } from 'react';
import { Aviso } from '@/componentes/aviso';
import { EnlaceParaCompartir } from '@/componentes/enlace-para-compartir';
import { alEnviarSinReinicio, BotonEnviar, Campo, EnvioSinReinicio } from '@/componentes/formulario';
import { mensajeConEnlace } from '@/lib/administracion';
import { invitarDueno, type ResultadoEnlace } from '../../acciones';

/** Invitar al dueño: nombre y correo. Al terminar, el enlace para pasárselo (sirve una vez). */
export function InvitarDueno({ negocioId, negocio }: { negocioId: string; negocio: string }) {
  const [estado, enviar, pendiente] = useActionState<ResultadoEnlace, FormData>(invitarDueno.bind(null, negocioId), {});
  if (estado.enlace) {
    return <EnlaceParaCompartir enlace={estado.enlace.url} vence={estado.enlace.vence} mensaje={mensajeConEnlace('invitacion', negocio, estado.enlace.url)} />;
  }
  return (
    <EnvioSinReinicio pendiente={pendiente}>
      <form action={enviar} onSubmit={alEnviarSinReinicio(enviar)} className="flex flex-col gap-4">
        {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
        <div className="grid gap-4 md:grid-cols-2">
          <Campo id="dueno-nombre" name="nombre" etiqueta="Nombre del dueño" required maxLength={100} autoComplete="off" />
          <Campo id="dueno-email" name="email" etiqueta="Correo del dueño" type="email" required maxLength={254} autoComplete="off" />
        </div>
        <BotonEnviar enviando="Creando enlace…">Crear enlace de invitación</BotonEnviar>
      </form>
    </EnvioSinReinicio>
  );
}
