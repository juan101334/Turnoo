'use client';

import { SendHorizontal } from 'lucide-react';
import type { EstadoFormulario } from '@/lib/acciones';
import { Aviso } from './aviso';
import { useAvisar } from './avisos-flotantes';
import { Formulario, useEnvioPendiente } from './formulario';

const sinError = (e: EstadoFormulario) => Boolean(e.listo);

/**
 * La respuesta al cliente, fija abajo de la conversación: el campo y "Enviar" a la mano mientras
 * se lee. Se vacía al enviar; si WhatsApp o el backend lo rechazan, el texto se queda.
 */
export function FormularioDeRespuesta({ accion, ayuda }: { accion: (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>; ayuda: string }) {
  const avisar = useAvisar();
  return (
    <Formulario<EstadoFormulario>
      accion={accion}
      inicial={{}}
      limpiarSi={sinError}
      alTerminar={(e) => {
        if (e.listo) avisar(e.listo);
      }}
      className="flex flex-col gap-2"
    >
      {(estado) => (
        <>
          {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
          <label htmlFor="texto" className="sr-only">
            Mensaje
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id="texto"
              name="texto"
              required
              rows={2}
              maxLength={4096}
              aria-describedby="texto-ayuda"
              placeholder="Escribe tu respuesta…"
              className="max-h-40 min-h-11 flex-1 resize-y rounded-lg border border-borde bg-superficie px-3 py-2 text-base"
            />
            <BotonEnviarMensaje />
          </div>
          <p id="texto-ayuda" className="text-xs text-suave">
            {ayuda}
          </p>
        </>
      )}
    </Formulario>
  );
}

function BotonEnviarMensaje() {
  const pendiente = useEnvioPendiente();
  return (
    <button
      type="submit"
      disabled={pendiente}
      aria-label={pendiente ? 'Enviando…' : 'Enviar por WhatsApp'}
      className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-marca px-4 font-semibold text-white transition-colors duration-150 hover:bg-marca-oscura disabled:cursor-wait disabled:opacity-70"
    >
      <SendHorizontal aria-hidden className="size-5" />
      <span className="hidden sm:inline">{pendiente ? 'Enviando…' : 'Enviar'}</span>
    </button>
  );
}
