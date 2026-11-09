/** Base de conocimiento: preguntas y respuestas que el asistente usa para contestar. */

export interface EntradaConocimiento {
  id: string;
  pregunta: string;
  respuesta: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BaseDeConocimiento {
  entradas: EntradaConocimiento[];
  caracteresActivos: number;
  maxCaracteresActivos: number;
  maxEntradas: number;
}

/** Los mismos topes que el backend (conocimiento.servicio.ts), para avisar al escribir. */
export const MAX_PREGUNTA = 300;
export const MAX_RESPUESTA = 2_000;

/** Qué tan llena está la base, en porcentaje entero de 0 a 100. Hacia arriba: algo usado nunca se ve como 0 %. */
export function porcentajeUsado(usado: number, maximo: number): number {
  if (maximo <= 0) return 100;
  return Math.min(100, Math.max(0, Math.ceil((usado / maximo) * 100)));
}

/** Una pregunta que el asistente no supo responder, sacada de la conversación que pasó al negocio. */
export interface PreguntaSinRespuesta {
  conversacionId: string;
  texto: string;
  cuando: string;
}

const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Lo que los clientes preguntaron y el asistente no tenía en la base (derivaciones "sin
 * información" con lo que pidió), la más reciente primero, sin repetidas y sin las que ya están
 * en la base con el mismo texto. Solo mira la última derivación de cada conversación.
 */
export function preguntasSinRespuesta(
  conversaciones: { id: string; ultimaDerivacion: { motivo: string; detalle: string | null; creadaEn: string } | null }[],
  entradas: Pick<EntradaConocimiento, 'pregunta'>[],
  maximo = 10,
): PreguntaSinRespuesta[] {
  const vistas = new Set(entradas.map((e) => normalizar(e.pregunta)));
  const resultado: PreguntaSinRespuesta[] = [];
  const candidatas = conversaciones
    .filter((c) => c.ultimaDerivacion?.motivo === 'sin_informacion' && c.ultimaDerivacion.detalle?.trim())
    .sort((a, b) => Date.parse(b.ultimaDerivacion!.creadaEn) - Date.parse(a.ultimaDerivacion!.creadaEn));
  for (const c of candidatas) {
    const texto = c.ultimaDerivacion!.detalle!.trim();
    const clave = normalizar(texto);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    resultado.push({ conversacionId: c.id, texto, cuando: c.ultimaDerivacion!.creadaEn });
    if (resultado.length === maximo) break;
  }
  return resultado;
}
