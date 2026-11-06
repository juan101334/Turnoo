/** Motivos con los que una conversación pasa a una persona del negocio (CHECK de `derivaciones`). */
export type MotivoDerivacion =
  | 'fuera_de_tema'
  | 'sin_informacion'
  | 'cliente_pidio_humano'
  | 'sin_comprension'
  | 'limite_plan'
  | 'error';

/** Un mensaje del historial tal como lo lee la IA: quién lo dijo y qué dijo. */
export interface MensajeDelHistorial {
  /** `cliente` es la persona; `negocio` agrupa lo que respondieron la IA o una persona del negocio. */
  autor: 'cliente' | 'negocio';
  tipo: 'texto' | 'audio' | 'imagen' | 'plantilla' | 'otro';
  contenido: string | null;
  /** Texto de una nota de voz. */
  transcripcion: string | null;
  /** Si la imagen quedó guardada en el disco. */
  imagenGuardada: boolean;
  /** Por qué no se pudo transcribir o guardar el adjunto. */
  adjuntoError: string | null;
  creadoEn: Date;
}

/** Una función que pidió la IA y lo que el backend le respondió (tabla ia_pasos). */
export interface PasoDeIA {
  callId: string;
  nombre: string;
  /** JSON en texto, tal como lo generó el modelo. */
  argumentos: string;
  /** JSON en texto, tal como se le devolvió al modelo. */
  resultado: string;
  creadoEn: Date;
  /** Posición dentro de una misma respuesta. */
  orden: number;
}

/** Lo que la IA necesita saber de una conversación para responder. */
export interface ContextoDeConversacion {
  negocio: {
    nombre: string;
    zonaHoraria: string;
    direccion: string | null;
    ciudad: string | null;
    anticipacionMaxDias: number;
    horasLimiteCancelacion: number;
  };
  /** Como lo dio WhatsApp o el panel. El teléfono nunca se incluye. */
  nombreCliente: string | null;
  historial: MensajeDelHistorial[];
  /** Funciones que usó la IA desde el mensaje más viejo del historial, en orden. */
  pasos: PasoDeIA[];
}

/** Una conversación como la ve el dueño en el panel. */
export interface ConversacionDelPanel {
  id: string;
  estado: 'bot' | 'humano' | 'cerrada';
  humanoDesde: Date | null;
  ultimoMensajeEn: Date | null;
  cliente: { id: string; nombre: string | null; telefono: string | null };
  /** La derivación más reciente, si hubo. */
  ultimaDerivacion: { motivo: MotivoDerivacion; detalle: string | null; creadaEn: Date } | null;
}

export interface MensajeDelPanel {
  id: string;
  direccion: 'entrante' | 'saliente';
  emisor: 'cliente' | 'ia' | 'humano' | 'sistema';
  tipo: MensajeDelHistorial['tipo'];
  contenido: string | null;
  transcripcion: string | null;
  tieneImagen: boolean;
  estadoEntrega: string | null;
  creadoEn: Date;
}
