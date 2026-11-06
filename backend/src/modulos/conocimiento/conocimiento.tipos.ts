/** Una pregunta con su respuesta, escrita por el dueño para que la IA responda con ella. */
export interface EntradaConocimiento {
  id: string;
  pregunta: string;
  respuesta: string;
  /** Solo las activas llegan a la IA. */
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BaseDeConocimiento {
  entradas: EntradaConocimiento[];
  /** Caracteres de las entradas activas (pregunta + respuesta), lo que la IA lee en cada mensaje. */
  caracteresActivos: number;
  maxCaracteresActivos: number;
  maxEntradas: number;
}

export interface NuevaEntrada {
  pregunta: string;
  respuesta: string;
  activo?: boolean | undefined;
}

export interface CambiosEntrada {
  pregunta?: string | undefined;
  respuesta?: string | undefined;
  activo?: boolean | undefined;
}
