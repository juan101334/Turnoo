import { ChevronLeft, CircleAlert, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';
import { AlFinalDelHistorial } from '@/componentes/al-final-del-historial';
import { FormularioDeRespuesta } from '@/componentes/formulario-de-respuesta';
import { ListaDeConversaciones } from '@/componentes/lista-de-conversaciones';
import { RefrescoAutomatico } from '@/componentes/refresco-automatico';
import { telefonoLegible } from '@/lib/citas';
import { asistenteCallaHasta, EMISORES, MOTIVOS, nombreDelCliente, textoDelMensaje, ventanaHasta } from '@/lib/conversaciones';
import { conversacion as leerConversacion, conversaciones as leerConversaciones, mensajesDe, miNegocio } from '@/lib/datos';
import { diaRelativo, fechaDe, fechaLarga, horaLocal, hoyEn } from '@/lib/fechas';
import { exigirUsuario } from '@/lib/sesion';
import { responder } from '../acciones';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await exigirUsuario('mensajes');
  const c = await leerConversacion((await params).id);
  return { title: `${nombreDelCliente(c.cliente, telefonoLegible)} · Mensajes` };
}

/**
 * Una conversación de WhatsApp: el historial (el más viejo arriba, abre en el último) y la
 * respuesta fija abajo. En el escritorio, la lista de conversaciones queda a la izquierda.
 * Responder hace que el asistente calle con ese cliente durante las horas que fija el negocio.
 */
export default async function PaginaConversacion({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ver?: string }> }) {
  const usuario = await exigirUsuario('mensajes');
  const zona = usuario.negocio.zonaHoraria;
  const { id } = await params;
  const todas = (await searchParams).ver === 'todas';
  const [c, mensajes, { configuracion }, lista] = await Promise.all([
    leerConversacion(id),
    mensajesDe(id),
    miNegocio(),
    leerConversaciones(todas ? undefined : 'humano'),
  ]);
  const ahora = new Date();
  const hoy = hoyEn(zona, ahora);
  const cuandoDia = (iso: string) => {
    const fecha = fechaDe(iso, zona);
    return diaRelativo(fecha, hoy) ?? fechaLarga(fecha);
  };
  const momento = (d: Date) => `${cuandoDia(d.toISOString()).toLowerCase()} a las ${horaLocal(d, zona)}`;

  const ventana = ventanaHasta(mensajes);
  const puedeEscribir = ventana !== null && ventana > ahora && c.cliente.telefono !== null;
  const calla = asistenteCallaHasta(c, configuracion.horasModoHumano, ahora);
  const estadoDelAsistente = calla
    ? `Hasta ${momento(calla)} el asistente no le responde; después vuelve a contestar cuando el cliente escriba.`
    : c.estado === 'humano'
      ? 'El asistente vuelve a responder cuando el cliente escriba.'
      : `La atiende el asistente. Si le escribes, deja de responderle por ${configuracion.horasModoHumano} horas.`;

  return (
    <div className="mx-auto max-w-2xl lg:max-w-none">
      <RefrescoAutomatico segundos={20} />
      <div className="lg:grid lg:h-[calc(100dvh-4.5rem)] lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-6">
        <div className="hidden min-h-0 lg:flex lg:flex-col">
          <ListaDeConversaciones lista={lista} zona={zona} todas={todas} abierta={c.id} />
        </div>

        <section aria-labelledby="titulo-conversacion" className="flex min-h-0 flex-col lg:rounded-xl lg:border lg:border-borde lg:bg-superficie">
          <header className="lg:border-b lg:border-borde lg:px-4 lg:pt-3 lg:pb-3">
            <Link href={`/mensajes${todas ? '?ver=todas' : ''}`} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca lg:hidden">
              <ChevronLeft aria-hidden className="size-5" />
              Mensajes
            </Link>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 id="titulo-conversacion" className="text-2xl font-semibold break-words lg:text-xl">
                  {nombreDelCliente(c.cliente, telefonoLegible)}
                </h1>
                {c.cliente.telefono && <p className="text-sm text-suave tabular-nums">{telefonoLegible(c.cliente.telefono)}</p>}
              </div>
              <Link
                href={`/clientes/${c.cliente.id}`}
                className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-borde px-3 text-sm font-medium hover:bg-fondo"
              >
                <UserRound aria-hidden className="size-4" />
                Ficha
              </Link>
            </div>
            {c.estado === 'humano' && c.ultimaDerivacion && (
              <div className="mt-3 rounded-lg bg-aviso-suave px-3 py-2 text-sm text-aviso">
                <p className="font-semibold">{MOTIVOS[c.ultimaDerivacion.motivo] ?? 'Necesita a una persona'}</p>
                {c.ultimaDerivacion.detalle && <p>Lo que pidió: {c.ultimaDerivacion.detalle}</p>}
              </div>
            )}
            <p className="mt-2 text-sm text-suave">{estadoDelAsistente}</p>
          </header>

          <ol id="historial" aria-label="Historial" className="my-4 flex flex-col gap-2 lg:my-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-4 lg:py-4">
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
                      className={`max-w-[85%] rounded-xl px-3 py-2 lg:max-w-[70%] ${
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
          <AlFinalDelHistorial id="historial" cantidad={mensajes.length} />

          <div
            aria-labelledby="responder"
            role="region"
            className="sticky bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-borde bg-superficie/95 px-4 pt-2 pb-3 backdrop-blur md:bottom-0 lg:static lg:mx-0 lg:rounded-b-xl lg:bg-superficie lg:px-4"
          >
            <h2 id="responder" className="sr-only">
              Responder
            </h2>
            {puedeEscribir ? (
              <FormularioDeRespuesta
                accion={responder.bind(null, id)}
                ayuda={`Le llega por el WhatsApp del negocio. Puedes escribirle hasta ${momento(ventana!)}.`}
              />
            ) : (
              <p className="py-1 text-sm text-suave">
                {c.cliente.telefono === null
                  ? 'El cliente pidió borrar sus datos: ya no se le puede escribir.'
                  : 'Pasaron más de 24 horas desde su último mensaje y WhatsApp no deja escribirle libremente. Podrás responder cuando el cliente vuelva a escribir.'}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
