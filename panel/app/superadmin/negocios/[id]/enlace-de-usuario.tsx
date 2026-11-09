'use client';

import { KeyRound, Send } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Aviso } from '@/componentes/aviso';
import { EnlaceParaCompartir } from '@/componentes/enlace-para-compartir';
import { mensajeConEnlace } from '@/lib/administracion';
import { enlaceDeUsuario, type ResultadoEnlace } from '../../acciones';

/** Enlace de invitación o de contraseña nueva para un usuario del negocio, listo para compartir. */
export function EnlaceDeUsuario({ negocioId, usuarioId, tipo, negocio }: { negocioId: string; usuarioId: string; tipo: 'reenviarInvitacion' | 'recuperacion'; negocio: string }) {
  const [resultado, setResultado] = useState<ResultadoEnlace>({});
  const [pendiente, iniciar] = useTransition();
  if (resultado.enlace) {
    return (
      <EnlaceParaCompartir
        enlace={resultado.enlace.url}
        vence={resultado.enlace.vence}
        mensaje={mensajeConEnlace(tipo === 'recuperacion' ? 'recuperacion' : 'invitacion', negocio, resultado.enlace.url)}
      />
    );
  }
  const Icono = tipo === 'recuperacion' ? KeyRound : Send;
  return (
    <div className="flex flex-col gap-2">
      {resultado.error && <Aviso tipo="error">{resultado.error}</Aviso>}
      <button
        type="button"
        disabled={pendiente}
        onClick={() => iniciar(async () => setResultado(await enlaceDeUsuario(negocioId, usuarioId, tipo)))}
        className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-borde bg-superficie px-3 text-sm font-semibold hover:bg-fondo disabled:cursor-wait disabled:opacity-70"
      >
        <Icono aria-hidden className="size-4" />
        {pendiente ? 'Generando…' : tipo === 'recuperacion' ? 'Enlace para nueva contraseña' : 'Reenviar invitación'}
      </button>
    </div>
  );
}
