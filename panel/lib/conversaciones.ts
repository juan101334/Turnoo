/**
 * Conversaciones de WhatsApp tal como las devuelve el backend (solo el dueño las ve) y lo que el
 * panel calcula de ellas. Las reglas de verdad (ventana de 24 h, modo humano) las aplica el backend.
 */

export type MotivoDerivacion = 'fuera_de_tema' | 'sin_informacion' | 'cliente_pidio_humano' | 'sin_comprension' | 'limite_plan' | 'error';

export interface Conversacion {
  id: string;
  estado: 'bot' | 'humano' | 'cerrada';
  humanoDesde: string | null;
  ultimoMensajeEn: string | null;
  cliente: { id: string; nombre: string | null; telefono: string | null };
  ultimaDerivacion: { motivo: MotivoDerivacion; detalle: string | null; creadaEn: string } | null;
}

export interface Mensaje {
  id: string;
  direccion: 'entrante' | 'saliente';
  emisor: 'cliente' | 'ia' | 'humano' | 'sistema';
  tipo: 'texto' | 'audio' | 'imagen' | 'plantilla' | 'otro';
  contenido: string | null;
  transcripcion: string | null;
  tieneImagen: boolean;
  estadoEntrega: string | null;
  creadoEn: string;
}

/** Los mismos textos que el aviso de WhatsApp al dueño (avisos.servicio.ts). */
export const MOTIVOS: Record<MotivoDerivacion, string> = {
  sin_informacion: 'El asistente no tenía esa información',
  cliente_pidio_humano: 'Pidió hablar con una persona',
  fuera_de_tema: 'Insistió en un tema que no es del negocio',
  sin_comprension: 'El asistente no entendió lo que quería',
  limite_plan: 'El plan llegó al límite de conversaciones con el asistente',
  error: 'El asistente falló varias veces seguidas',
};

export const EMISORES: Record<Mensaje['emisor'], string> = {
  cliente: 'Cliente',
  ia: 'Asistente',
  humano: 'Negocio',
  sistema: 'Aviso automático',
};

/** Lo que se muestra de un mensaje, según su tipo (las notas de voz, con su transcripción). */
export function textoDelMensaje(m: Pick<Mensaje, 'tipo' | 'contenido' | 'transcripcion' | 'tieneImagen'>): string {
  switch (m.tipo) {
    case 'audio':
      return m.transcripcion ? `Nota de voz: "${m.transcripcion}"` : 'Nota de voz (no se pudo transcribir)';
    case 'imagen':
      return m.contenido ? `Imagen: ${m.contenido}` : 'Imagen';
    case 'otro':
      return m.contenido ?? 'Mensaje que el panel no puede mostrar (sticker, ubicación…)';
    default:
      return m.contenido ?? '';
  }
}

/** WhatsApp solo deja escribir libre hasta 24 h después del último mensaje del cliente. */
export const HORAS_VENTANA = 24;

/** ¿Hasta cuándo se le puede escribir? null si el cliente nunca escribió. */
export function ventanaHasta(mensajes: Pick<Mensaje, 'direccion' | 'creadoEn'>[]): Date | null {
  const ultimo = mensajes.filter((m) => m.direccion === 'entrante').at(-1);
  return ultimo ? new Date(Date.parse(ultimo.creadoEn) + HORAS_VENTANA * 3_600_000) : null;
}

/**
 * Desde que una persona del negocio toma la conversación, el asistente calla `horas`. Pasado ese
 * tiempo vuelve a responder cuando el cliente escriba (lo decide el backend al recibir el mensaje).
 * Devuelve hasta cuándo calla, o null si ya no calla.
 */
export function asistenteCallaHasta(c: Pick<Conversacion, 'estado' | 'humanoDesde'>, horas: number, ahora: Date = new Date()): Date | null {
  if (c.estado !== 'humano' || !c.humanoDesde) return null;
  const hasta = new Date(Date.parse(c.humanoDesde) + horas * 3_600_000);
  return hasta > ahora ? hasta : null;
}

/** 'Cliente sin nombre' o el teléfono si no dio nombre. */
export function nombreDelCliente(c: Conversacion['cliente'], legible: (tel: string) => string): string {
  if (c.nombre) return c.nombre;
  return c.telefono ? legible(c.telefono) : 'Cliente sin nombre';
}
