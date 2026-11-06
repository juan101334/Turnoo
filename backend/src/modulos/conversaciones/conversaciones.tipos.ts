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
  creadoEn: Date;
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
}
