import { MessagesSquare } from 'lucide-react';
import type { Metadata } from 'next';
import { ListaDeConversaciones } from '@/componentes/lista-de-conversaciones';
import { RefrescoAutomatico } from '@/componentes/refresco-automatico';
import { conversaciones as leerConversaciones } from '@/lib/datos';
import { SECCIONES } from '@/lib/navegacion';
import { exigirUsuario } from '@/lib/sesion';

export const metadata: Metadata = { title: SECCIONES.mensajes.etiqueta };

/**
 * Conversaciones de WhatsApp. Por defecto, las que el asistente pasó a una persona; ?ver=todas
 * muestra también las que atiende el asistente. La más reciente arriba. En el escritorio, la
 * conversación se abre a la derecha de la lista.
 */
export default async function PaginaMensajes({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const usuario = await exigirUsuario('mensajes');
  const todas = (await searchParams).ver === 'todas';
  const lista = await leerConversaciones(todas ? undefined : 'humano');

  return (
    <div className="mx-auto max-w-2xl lg:max-w-none">
      <RefrescoAutomatico />
      <h1 className="text-2xl font-semibold">Mensajes</h1>
      <p className="mb-4 text-sm text-suave">Clientes de WhatsApp que el asistente pasó a una persona del negocio. Respóndeles desde aquí.</p>
      <div className="lg:grid lg:h-[calc(100dvh-11rem)] lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-6">
        <ListaDeConversaciones lista={lista} zona={usuario.negocio.zonaHoraria} todas={todas} />
        <div className="hidden flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-borde bg-superficie text-center text-suave lg:flex">
          <MessagesSquare aria-hidden className="size-8" />
          <p>Elige una conversación para leerla y responder.</p>
        </div>
      </div>
    </div>
  );
}
