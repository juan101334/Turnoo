export type TipoMensaje = 'texto' | 'audio' | 'imagen' | 'otro';

/** Un mensaje de WhatsApp ya validado y en los términos de Turnoo. */
export interface MensajeEntrante {
  waMessageId: string;
  telefono: string;
  nombre: string | null;
  tipo: TipoMensaje;
  contenido: string | null;
  mediaId: string | null;
  enviadoEn: Date;
}

export interface ResultadoEvento {
  /** Mensajes que no se pudieron guardar por un fallo que puede ser pasajero. */
  fallidos: number;
}

export interface ConfiguracionWebhook {
  appSecret: string;
  verifyToken: string;
}
