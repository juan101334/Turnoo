import { ChevronLeft, CircleAlert, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';
import { Aviso } from '@/componentes/aviso';
import { FormularioConEstado } from '@/componentes/formulario-con-estado';
import { RefrescoAutomatico } from '@/componentes/refresco-automatico';
import { telefonoLegible } from '@/lib/citas';
import { asistenteCallaHasta, EMISORES, MOTIVOS, nombreDelCliente, textoDelMensaje, ventanaHasta } from '@/lib/conversaciones';
import { conversacion as leerConversacion, mensajesDe, miNegocio } from '@/lib/datos';
import { diaRelativo, fechaDe, fechaLarga, horaLocal, hoyEn } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';
import { responder } from '../acciones';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await exigirUsuario('mensajes');
  const c = await leerConversacion((await params).id);
  return { title: `${nombreDelCliente(c.cliente, telefonoLegible)} · Mensajes` };
}

/**
 * Una conversación de WhatsApp: el historial (el más viejo arriba) y la respuesta del negocio.
 * Responder hace que el asistente calle con ese cliente durante las horas que fija el negocio.
 */
export default async function PaginaConversacion({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await exigirUsuario('mensajes');
  const zona = usuario.negocio.zonaHoraria;
  const { id } = await params;
  const [c, mensajes, { configuracion }] = await Promise.all([leerConversacion(id), mensajesDe(id), miNegocio()]);
  const ahora = new Date();
  const hoy = hoyEn(zona, ahora);
  const cuandoDia = (iso: string) => {
    const fecha = fechaDe(iso, zona);
    return diaRelativo(fecha, hoy) ?? fechaLarga(fecha);
  };
  const momento = (d: Date) => `${cuandoDia(d.toISOString()).toLowerCase()} a las ${horaLocal(d, zona)}`;

  const ventana = ventanaHasta(mensajes);
  const puedeEscribir = ventana !== null && ventana > ahora && c?.cliente.telefono !== null;
  const calla = c ? asistenteCallaHasta(c, configuracion.horasModoHumano, ahora) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <RefrescoAutomatico segundos={20} />
      <Link href="/mensajes" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca">
        <ChevronLeft aria-hidden className="size-5" />
        Mensajes
      </Link>

      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold break-words">{c ? nombreDelCliente(c.cliente, telefonoLegible) : 'Conversación'}</h1>
          {c?.cliente.telefono && <p className="text-sm text-suave tabular-nums">{telefonoLegible(c.cliente.telefono)}</p>}
        </div>
        {c && (
          <Link
            href={`/clientes/${c.cliente.id}`}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-borde px-3 text-sm font-medium hover:bg-fondo"
          >
            <UserRound aria-hidden className="size-4" />
            Ficha
          </Link>
        )}
      </div>

      {c?.estado === 'humano' && c.ultimaDerivacion && (
        <div className="mb-3 rounded-xl bg-aviso-suave p-3 text-sm text-aviso">
          <p className="font-semibold">{MOTIVOS[c.ultimaDerivacion.motivo] ?? 'Necesita a una persona'}</p>
          {c.ultimaDerivacion.detalle && <p>Lo que pidió: {c.ultimaDerivacion.detalle}</p>}
        </div>
      )}
      <div className="mb-4">
        <Aviso tipo="info">
          {calla
            ? `Hasta ${momento(calla)} el asistente no le responde; después vuelve a contestar cuando el cliente escriba.`
            : c?.estado === 'humano'
              ? 'El asistente vuelve a responder cuando el cliente escriba.'
              : `La atiende el asistente. Si le escribes, el asistente deja de responderle por ${configuracion.horasModoHumano} horas.`}
        </Aviso>
      </div>

      <ol aria-label="Historial" className="mb-4 flex flex-col gap-2">
        {mensajes.length === 0 && <li className="text-center text-sm text-suave">Sin mensajes.</li>}
        {mensajes.map((m, i) => {
          const dia = cuandoDia(m.creadoEn);
          const nuevoDia = i === 0 || dia !== cuandoDia(mensajes[i - 1]!.creadoEn);
          const delCliente = m.direccion === 'entrante';
          const fallido = m.estadoEntrega === 'fallido';
          return (
            <Fragment key={m.id}>
              {nuevoDia && <li className="py-1 text-center text-xs font-medium text-suave first-letter:uppercase">{dia}</li>}
              <li className={`flex flex-col ${delCliente ? 'items-start' : 'items-end'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 ${
                    delCliente ? 'rounded-bl-sm border border-borde bg-superficie' : m.emisor === 'humano' ? 'rounded-br-sm bg-marca-suave' : 'rounded-br-sm bg-fondo ring-1 ring-borde'
                  } ${fallido ? 'ring-1 ring-peligro' : ''}`}
                >
                  <p className="text-xs font-semibold text-suave">
                    {EMISORES[m.emisor]} · {horaLocal(m.creadoEn, zona)}
                  </p>
                  <p className="break-words whitespace-pre-line">{textoDelMensaje(m)}</p>
                </div>
                {fallido && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-peligro">
                    <CircleAlert aria-hidden className="size-3.5" />
                    No se entregó
                  </p>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>

      <section aria-labelledby="responder" className="rounded-xl border border-borde bg-superficie p-4">
        <h2 id="responder" className="mb-2 font-semibold">
          Responder
        </h2>
        {puedeEscribir ? (
          <FormularioConEstado limpiar accion={responder.bind(null, id)} boton="Enviar por WhatsApp" enviando="Enviando…">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="texto" className="text-sm font-medium">
                Mensaje
              </label>
              <textarea id="texto" name="texto" required rows={3} maxLength={4096} aria-describedby="texto-ayuda" className="rounded-lg border border-borde bg-superficie px-3 py-2 text-base" />
              <p id="texto-ayuda" className="text-sm text-suave">
                Le llega desde el WhatsApp del negocio. Puedes escribirle hasta {momento(ventana!)} (24 horas desde su último mensaje).
              </p>
            </div>
          </FormularioConEstado>
        ) : (
          <p className="text-sm text-suave">
            {c?.cliente.telefono === null
              ? 'El cliente pidió borrar sus datos: ya no se le puede escribir.'
              : 'Pasaron más de 24 horas desde su último mensaje y WhatsApp no deja escribirle libremente. Podrás responder cuando el cliente vuelva a escribir.'}
          </p>
        )}
      </section>
    </div>
  );
}
