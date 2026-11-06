/**
 * Formatos de los adjuntos, leídos de los bytes y no de lo que dice el remitente: el tipo MIME
 * lo informa quien envía, y un archivo puede decir ser imagen sin serlo. Funciones puras.
 */

export interface TipoDeImagen {
  extension: 'jpg' | 'png' | 'webp';
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

/** Solo jpg, png y webp, reconocidos por su firma al inicio del archivo. */
export function tipoDeImagen(bytes: Buffer): TipoDeImagen | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: 'jpg', mimeType: 'image/jpeg' };
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png', mimeType: 'image/png' };
  }
  if (bytes.length >= 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') {
    return { extension: 'webp', mimeType: 'image/webp' };
  }
  return null;
}

export const MIME_POR_EXTENSION: Record<string, TipoDeImagen['mimeType']> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Audios que acepta la transcripción. Las notas de voz de WhatsApp son ogg/opus. */
export function formatoDeAudio(bytes: Buffer): { nombreArchivo: string; mimeType: string } | null {
  if (bytes.length >= 4 && bytes.toString('latin1', 0, 4) === 'OggS') return { nombreArchivo: 'nota.ogg', mimeType: 'audio/ogg' };
  // MP3: con etiqueta ID3, o la marca de sincronía de un cuadro de audio.
  if (bytes.length >= 3 && (bytes.toString('latin1', 0, 3) === 'ID3' || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0))) {
    return { nombreArchivo: 'audio.mp3', mimeType: 'audio/mpeg' };
  }
  // MP4 o M4A: la caja "ftyp" va en los bytes 4 a 8.
  if (bytes.length >= 8 && bytes.toString('latin1', 4, 8) === 'ftyp') return { nombreArchivo: 'audio.m4a', mimeType: 'audio/mp4' };
  return null;
}

/**
 * Duración de un ogg/opus en segundos, sin decodificarlo: la posición (granule) de la última
 * página es el número de muestras a 48 kHz, menos el pre-skip que indica la cabecera OpusHead.
 * null si no es un ogg/opus que se pueda leer.
 */
export function duracionOggOpus(bytes: Buffer): number | null {
  const cabecera = bytes.indexOf('OpusHead', 0, 'latin1');
  const ultima = bytes.lastIndexOf('OggS', undefined, 'latin1');
  if (cabecera < 0 || ultima < 0 || ultima + 14 > bytes.length || cabecera + 12 > bytes.length) return null;
  const muestras = bytes.readBigUInt64LE(ultima + 6);
  const preSkip = BigInt(bytes.readUInt16LE(cabecera + 10));
  if (muestras < preSkip) return null;
  return Number(muestras - preSkip) / 48_000;
}
