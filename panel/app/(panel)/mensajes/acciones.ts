'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { texto, type EstadoFormulario } from '@/lib/acciones';
import { ErrorDelBackend, llamarAlBackend } from '@/lib/backend';
import { esId } from '@/lib/datos';

/** El máximo de Meta para un mensaje de texto (whatsapp.envio.ts). */
const MAX_TEXTO = 4096;

/**
 * Responde al cliente como persona del negocio. El backend toma la conversación (el asistente
 * calla) y envía por WhatsApp; si Meta lo rechaza responde 502 y el mensaje queda como fallido.
 */
export async function responder(conversacionId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  if (!esId(conversacionId)) return { error: 'Conversación no válida.' };
  const mensaje = texto(datos, 'texto');
  if (!mensaje) return { error: 'Escribe el mensaje.' };
  if (mensaje.length > MAX_TEXTO) return { error: `El mensaje no puede pasar de ${MAX_TEXTO} caracteres.` };

  try {
    await llamarAlBackend(`/conversaciones/${conversacionId}/mensajes`, { metodo: 'POST', cuerpo: { texto: mensaje } });
  } catch (error) {
    if (!(error instanceof ErrorDelBackend)) throw error;
    if (error.estado === 401) redirect('/sesion-vencida');
    if (error.estado === 502) {
      revalidatePath('/', 'layout');
      return { error: 'WhatsApp no aceptó el mensaje y quedó como no entregado. Revisa el texto e intenta de nuevo.' };
    }
    return { error: error.message };
  }
  revalidatePath('/', 'layout');
  return { listo: 'Mensaje enviado.' };
}
