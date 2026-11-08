import { BookOpen, Pencil } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Aviso } from '@/componentes/aviso';
import { BotonDeAccion } from '@/componentes/boton-de-accion';
import { FormularioConEstado } from '@/componentes/formulario-con-estado';
import { porcentajeUsado } from '@/lib/conocimiento';
import { conocimiento } from '@/lib/datos';
import { SECCIONES } from '@/lib/navegacion';
import { exigirUsuario } from '@/lib/sesion';
import { borrarEntrada, cambiarEntradaActiva, crearEntrada } from './acciones';
import { CamposDeEntrada } from './campos';

export const metadata: Metadata = { title: SECCIONES.conocimiento.etiqueta };

const LISTO: Record<string, string> = { editada: 'Cambios guardados.' };

/**
 * Preguntas y respuestas que el asistente usa para contestar por WhatsApp (precios fuera de
 * servicios, parqueadero, medios de pago…). Las pausadas se guardan pero el asistente no las usa.
 */
export default async function PaginaConocimiento({ searchParams }: { searchParams: Promise<{ listo?: string }> }) {
  await exigirUsuario('conocimiento');
  const { listo } = await searchParams;
  const base = await conocimiento();
  const uso = porcentajeUsado(base.caracteresActivos, base.maxCaracteresActivos);
  const mensaje = listo ? LISTO[listo] : undefined;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">Base de conocimiento</h1>
      <p className="mb-4 text-sm text-suave">
        Lo que el asistente responde cuando un cliente pregunta algo del negocio. Si no encuentra la respuesta aquí, te pasa la conversación.
      </p>
      {mensaje && (
        <div className="mb-4">
          <Aviso tipo="exito">{mensaje}</Aviso>
        </div>
      )}

      <div className="mb-4 rounded-2xl border border-borde bg-superficie p-4">
        <div className="mb-1.5 flex justify-between gap-2 text-sm">
          <span className="font-medium">Espacio usado</span>
          <span className="text-suave tabular-nums">
            {base.entradas.length} de {base.maxEntradas} preguntas · {uso}%
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Espacio usado por las respuestas activas"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={uso}
          className="h-2 overflow-hidden rounded-full bg-fondo ring-1 ring-borde"
        >
          <div className={`h-full rounded-full ${uso >= 90 ? 'bg-peligro' : 'bg-marca'}`} style={{ width: `${uso}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-suave">El asistente lee todas las respuestas activas en cada mensaje; por eso hay un tope de texto.</p>
      </div>

      {base.entradas.length === 0 ? (
        <div className="mb-6 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-borde bg-superficie px-6 py-10 text-center text-suave">
          <BookOpen aria-hidden className="size-8" />
          <p>Todavía no hay preguntas. Empieza por lo que más te preguntan.</p>
        </div>
      ) : (
        <ul className="mb-6 flex flex-col gap-2">
          {base.entradas.map((e) => (
            <li key={e.id} className={`rounded-2xl border border-borde bg-superficie p-3 ${e.activo ? '' : 'opacity-75'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium break-words">{e.pregunta}</p>
                  {!e.activo && <p className="text-xs font-semibold text-suave">Pausada: el asistente no la usa</p>}
                </div>
                <Link
                  href={`/conocimiento/${e.id}`}
                  aria-label={`Editar: ${e.pregunta}`}
                  className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-borde px-3 text-sm font-medium hover:bg-fondo"
                >
                  <Pencil aria-hidden className="size-4" />
                  Editar
                </Link>
              </div>
              <p className="mt-1 text-sm break-words whitespace-pre-line text-suave">{e.respuesta}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <BotonDeAccion etiqueta={e.activo ? 'Pausar' : 'Activar'} enviando="Guardando…" accion={cambiarEntradaActiva.bind(null, e.id, !e.activo)} />
                <BotonDeAccion
                  etiqueta="Borrar"
                  enviando="Borrando…"
                  variante="peligro"
                  accion={borrarEntrada.bind(null, e.id)}
                  confirmar={{ pregunta: '¿Borrar esta pregunta?', detalle: 'El asistente dejará de usarla. Si solo quieres quitarla un tiempo, usa "Pausar".', boton: 'Sí, borrar' }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="nueva-entrada" className="rounded-2xl border border-borde bg-superficie p-4">
        <h2 id="nueva-entrada" className="mb-3 font-semibold">
          Agregar pregunta
        </h2>
        <FormularioConEstado accion={crearEntrada} boton="Agregar pregunta" enviando="Agregando…">
          <CamposDeEntrada prefijo="nueva" />
        </FormularioConEstado>
      </section>
    </div>
  );
}
